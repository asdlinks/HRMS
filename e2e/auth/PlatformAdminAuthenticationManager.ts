import fs from 'fs';
import path from 'path';
import { request as apiRequest, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test';
import type { PlatformAdminAuthConfig } from '../config/platformAdminAuth.config';
import type { PlatformAdminPersonaKey } from '../fixtures/platformAdminPersonas';
import {
  AuthenticationError,
  createConsolePlatformAdminAuthLogger,
  isPlatformAdminLoginResponseBody,
  type PlatformAdminAcquiredSession,
  type PlatformAdminAuthLogger,
  type PlatformAdminAuthenticationManagerDependencies,
  type PlatformAdminResolvedSession,
  type PlatformAdminStorageState,
} from './platformAdminTypes';

/**
 * The single owner of Platform Admin authentication for the E2E suite —
 * mirrors AuthenticationManager.ts's design (login, storage-state
 * creation/loading/validation, session recovery, file management, logging)
 * against the platform-admin stack instead of the tenant one: own login/
 * refresh endpoints, own cookie (mywe_platform_admin_refresh_token, path-
 * scoped to /api/platform-admin/auth), own JWT secret and `admin` response
 * field instead of `user`, and no tenantCode (a platform admin isn't
 * tenant-scoped — see server/middleware/platformAdminAuth.js).
 *
 * Deliberately a separate class, not an extension/parameterization of
 * AuthenticationManager — the two response shapes and login payloads differ
 * enough (no tenantCode; `admin` vs `user`) that sharing one implementation
 * would need a branch inside a class this suite's own guidelines describe as
 * "deliberately persona-agnostic" for the tenant stack. Frozen tenant auth
 * files (AuthenticationManager.ts, config/auth.config.ts, fixtures/auth.ts,
 * fixtures/personas.ts) are untouched by this addition.
 *
 * One instance per Playwright worker, scoped to that worker's `parallelIndex`
 * ("slot") — session files are keyed by (persona, slot), e.g.
 * e2e/.auth/platformAdmin.slot0.json, in the SAME e2e/.auth directory the
 * tenant suite uses (see platformAdminAuth.config.ts's authDir doc comment)
 * so global-setup.ts's existing name-agnostic glob clears these too, with no
 * changes to that file.
 *
 * IMPORTANT — shared IP-wide login rate limit (10 req/15min, no per-account
 * scoping — server/routes/platformAdmin/auth.routes.js's loginRateLimiter):
 * unlike the tenant AuthenticationManager (20/15min budget against 5
 * one-time logins, comfortable headroom), this budget is tight and shared
 * across every persona and every deliberate negative-login test in the
 * suite. This class still only logs in once per (persona, slot) thanks to
 * the same cache-then-validate-via-refresh design — callers that need to
 * exercise the login endpoint's negative/boundary/security behavior directly
 * (wrong password, lockout, rate-limit boundary, injection payloads) MUST
 * NOT go through acquireSession() for that — use a fresh, deliberately-
 * counted `request.newContext()` call instead (see the Auth & Session spec
 * files' own header comments for the per-file request budget).
 */
export class PlatformAdminAuthenticationManager {
  private readonly config: PlatformAdminAuthConfig;
  private readonly personas: PlatformAdminAuthenticationManagerDependencies['personas'];
  private readonly personaUserFile: PlatformAdminAuthenticationManagerDependencies['personaUserFile'];
  private readonly slot: number;
  private readonly logger: PlatformAdminAuthLogger;

  constructor(deps: PlatformAdminAuthenticationManagerDependencies) {
    this.config = deps.config;
    this.personas = deps.personas;
    this.personaUserFile = deps.personaUserFile;
    this.slot = deps.slot;
    this.logger = deps.logger ?? createConsolePlatformAdminAuthLogger(deps.config.verboseLogging);
  }

  hasCredentials(persona: PlatformAdminPersonaKey): boolean {
    return this.personas[persona] != null;
  }

  /**
   * Returns a ready-to-use browser context + page for the given persona.
   * Returns null if the persona has no configured credentials — the caller
   * is expected to skip the test in that case, not fail it.
   */
  async acquireSession(persona: PlatformAdminPersonaKey, browser: Browser): Promise<PlatformAdminAcquiredSession | null> {
    if (!this.hasCredentials(persona)) return null;

    const { state, accessToken } = await this.resolveState(persona);
    const context = await browser.newContext({
      storageState: state,
      extraHTTPHeaders: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
    const page = await context.newPage();
    return { context, page };
  }

  /**
   * Called from the fixture's teardown. The app rotates the refresh-token
   * cookie on every page mount (PlatformAdminAuthContext.tsx's rehydrate
   * effect), so the context's storage state right before it closes is the
   * only copy still guaranteed current.
   */
  async releaseSession(persona: PlatformAdminPersonaKey, context: BrowserContext): Promise<void> {
    const state = await context.storageState();
    this.writeCachedState(persona, state);
  }

  private async resolveState(persona: PlatformAdminPersonaKey): Promise<PlatformAdminResolvedSession> {
    const cached = this.readCachedState(persona);
    if (!cached) {
      this.logger.info(`[CACHE MISS] persona=${persona} slot=${this.slot}`);
      return this.login(persona);
    }

    this.logger.debug(`[CACHE HIT] persona=${persona} slot=${this.slot}`);
    const refreshed = await this.refreshCachedState(persona, cached);
    if (refreshed) {
      this.logger.debug(`[SESSION VALID] persona=${persona} slot=${this.slot}`);
      this.writeCachedState(persona, refreshed.state);
      return refreshed;
    }

    this.logger.warn(`[SESSION EXPIRED] persona=${persona} slot=${this.slot} — cached session is no longer valid.`);
    this.deleteCachedState(persona);
    const resolved = await this.login(persona);
    this.logger.info(`[SESSION RECOVERED] persona=${persona} slot=${this.slot}`);
    return resolved;
  }

  /**
   * Confirms a cached session is still accepted by the server via a single
   * lightweight POST /auth/refresh call — not subject to the login rate
   * limiter (only POST /auth/login is), and a direct, deterministic signal.
   * Uses its own scratch APIRequestContext so this persona's cookie can
   * never leak into another persona's calls.
   */
  private async refreshCachedState(persona: PlatformAdminPersonaKey, state: PlatformAdminStorageState): Promise<PlatformAdminResolvedSession | null> {
    let scratch: APIRequestContext | undefined;
    try {
      scratch = await apiRequest.newContext({ baseURL: this.config.baseURL, storageState: state });
      const response = await scratch.post(this.config.refreshEndpoint, { timeout: this.config.requestTimeoutMs });
      if (!response.ok()) return null;
      const body: unknown = await response.json().catch(() => null);
      const refreshedState = await scratch.storageState();
      return { state: refreshedState, accessToken: isPlatformAdminLoginResponseBody(body) ? body.accessToken ?? null : null };
    } catch {
      return null;
    } finally {
      await scratch?.dispose();
    }
  }

  /**
   * Logs in fresh. Retries only a transient (network-level) failure, up to
   * PlatformAdminAuthConfig.maxRecoveryAttempts times — an AuthenticationError
   * (bad credentials, rate limited, locked, inactive — any non-2xx response)
   * is never retried, since retrying can't fix a wrong password and would
   * only make the tight 10/15min rate limit worse.
   */
  private async login(persona: PlatformAdminPersonaKey): Promise<PlatformAdminResolvedSession> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.config.maxRecoveryAttempts; attempt++) {
      try {
        return await this.performLogin(persona);
      } catch (error) {
        if (error instanceof AuthenticationError) throw error;
        lastError = error;
        this.logger.warn(
          `[RECOVERY] transient error logging in platform-admin persona "${persona}" (slot ${this.slot}), ` +
            `attempt ${attempt}/${this.config.maxRecoveryAttempts}: ${describeError(error)}`
        );
      }
    }
    this.logger.error(
      `[RECOVERY FAILED] persona=${persona} slot=${this.slot} — login did not succeed after ${this.config.maxRecoveryAttempts} attempt(s).`
    );
    throw new AuthenticationError(
      `Platform-admin persona "${persona}" (slot ${this.slot}) could not log in after ${this.config.maxRecoveryAttempts} attempt(s): ${describeError(lastError)}`
    );
  }

  private async performLogin(persona: PlatformAdminPersonaKey): Promise<PlatformAdminResolvedSession> {
    const credentials = this.personas[persona];
    if (!credentials) {
      throw new AuthenticationError(`No credentials configured for platform-admin persona "${persona}".`);
    }

    const scratch = await apiRequest.newContext({ baseURL: this.config.baseURL });
    try {
      const response = await scratch.post(this.config.loginEndpoint, {
        data: { email: credentials.email, password: credentials.password },
        timeout: this.config.requestTimeoutMs,
      });
      if (!response.ok()) {
        throw new AuthenticationError(
          `Login failed for platform-admin persona "${persona}" (slot ${this.slot}): ${response.status()} ${await response.text()}`
        );
      }

      const body: unknown = await response.json().catch(() => null);
      if (isPlatformAdminLoginResponseBody(body) && body.admin?.id) {
        this.persistUserInfo(persona, body.admin.id, body.admin.name, body.admin.email);
      }

      this.logger.info(`[LOGIN] persona=${persona} slot=${this.slot}`);
      const state = await scratch.storageState();
      this.writeCachedState(persona, state);
      return { state, accessToken: isPlatformAdminLoginResponseBody(body) ? body.accessToken ?? null : null };
    } finally {
      await scratch.dispose();
    }
  }

  private persistUserInfo(persona: PlatformAdminPersonaKey, id: number, name: string, email: string): void {
    try {
      fs.writeFileSync(this.personaUserFile(persona), JSON.stringify({ id, name, email }));
    } catch (error) {
      this.logger.warn(
        `[CACHE WRITE FAILED] persona=${persona} slot=${this.slot} — could not persist user info (${describeError(error)}); continuing without it.`
      );
    }
  }

  private filePath(persona: PlatformAdminPersonaKey): string {
    return path.join(this.config.authDir, `${persona}.slot${this.slot}.json`);
  }

  private readCachedState(persona: PlatformAdminPersonaKey): PlatformAdminStorageState | null {
    const file = this.filePath(persona);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as PlatformAdminStorageState;
    } catch {
      this.logger.warn(`[CACHE MISS] persona=${persona} slot=${this.slot} — cached file was corrupted; ignoring it.`);
      return null;
    }
  }

  private writeCachedState(persona: PlatformAdminPersonaKey, state: PlatformAdminStorageState): void {
    try {
      fs.mkdirSync(this.config.authDir, { recursive: true });
      fs.writeFileSync(this.filePath(persona), JSON.stringify(state));
    } catch (error) {
      this.logger.warn(
        `[CACHE WRITE FAILED] persona=${persona} slot=${this.slot} — could not persist session cache (${describeError(error)}); continuing without it.`
      );
    }
  }

  private deleteCachedState(persona: PlatformAdminPersonaKey): void {
    const file = this.filePath(persona);
    try {
      if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    } catch (error) {
      this.logger.warn(
        `[CACHE WRITE FAILED] persona=${persona} slot=${this.slot} — could not delete stale cache file (${describeError(error)}).`
      );
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
