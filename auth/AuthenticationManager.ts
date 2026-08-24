import fs from 'fs';
import path from 'path';
import { request as apiRequest, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test';
import type { AuthConfig } from '../config/auth.config';
import type { PersonaKey } from '../fixtures/personas';
import {
  AuthenticationError,
  createConsoleAuthLogger,
  isLoginResponseBody,
  type AcquiredSession,
  type AuthenticationManagerDependencies,
  type AuthLogger,
  type ResolvedSession,
  type StorageState,
} from './types';

/**
 * The single owner of persona authentication for the E2E suite: login,
 * storage-state creation/loading/validation, session recovery, file
 * management, and authentication logging. Every fixture that needs an
 * authenticated page goes through this class rather than touching cookies,
 * files, or the auth API itself — see fixtures/auth.ts, which is a thin
 * Playwright-lifecycle wrapper around this one.
 *
 * All configurable behavior comes from AuthConfig (../config/auth.config.ts)
 * — this class never hardcodes an endpoint, timeout, or cookie name.
 *
 * One instance is created per Playwright worker (see fixtures/auth.ts),
 * scoped to that worker's `parallelIndex` ("slot"). Session files are keyed
 * by (persona, slot) — e.g. e2e/.auth/admin.slot0.json — not by the
 * ever-incrementing `workerIndex`, so a worker process recycled after a test
 * failure reads its slot's existing file instead of logging in again. See
 * e2e/README.md for the full rationale and lifecycle diagrams.
 *
 * Thread-safety note: within one worker process, calls are inherently
 * sequential (one test runs at a time per worker). Across processes, each
 * worker only ever reads/writes the files for its own slot — Playwright
 * guarantees a given `parallelIndex` is held by at most one live process at
 * a time — so no two instances ever touch the same file concurrently and no
 * locking is required.
 *
 * This class is deliberately persona-agnostic: it knows nothing about
 * Employee, Payroll, Attendance, or any other feature module. Every current
 * and future spec file authenticates through the same small set of RBAC
 * personas (admin/manager/hrDirectory/usersManageOnly/employeeSelf), so no
 * module-specific branching belongs here — adding a new feature area's tests
 * requires zero changes to this file.
 */
export class AuthenticationManager {
  private readonly config: AuthConfig;
  private readonly personas: AuthenticationManagerDependencies['personas'];
  private readonly personaUserFile: AuthenticationManagerDependencies['personaUserFile'];
  private readonly slot: number;
  private readonly logger: AuthLogger;

  constructor(deps: AuthenticationManagerDependencies) {
    this.config = deps.config;
    this.personas = deps.personas;
    this.personaUserFile = deps.personaUserFile;
    this.slot = deps.slot;
    this.logger = deps.logger ?? createConsoleAuthLogger(deps.config.verboseLogging);
  }

  hasCredentials(persona: PersonaKey): boolean {
    return this.personas[persona] != null;
  }

  /**
   * Returns a ready-to-use browser context + page for the given persona.
   * Returns null if the persona has no configured credentials — the caller
   * is expected to skip the test in that case, not fail it.
   *
   * Flow: reuse the cached session if one exists and a lightweight refresh
   * call confirms it's still valid; otherwise log in fresh. Never loops —
   * a session that's expired gets exactly one fresh login, and a login that
   * fails for an auth-level reason (bad credentials, rate limit) fails the
   * test immediately rather than retrying.
   */
  async acquireSession(persona: PersonaKey, browser: Browser): Promise<AcquiredSession | null> {
    if (!this.hasCredentials(persona)) return null;

    const { state, accessToken } = await this.resolveState(persona);
    // The app never exposes its access token via a cookie or localStorage
    // (client/src/api/client.ts keeps it in an in-memory JS variable only,
    // attached by an axios interceptor that page.request bypasses entirely)
    // — see ResolvedSession's doc comment in ./types.ts. Setting it as a
    // context-level default header is what makes `adminPage.request.*` (and
    // every other persona's) direct API calls actually authenticate, not
    // just page-driven navigation.
    const context = await browser.newContext({
      storageState: state,
      extraHTTPHeaders: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
    const page = await context.newPage();
    return { context, page };
  }

  /**
   * Called from the fixture's teardown, once the test using this session is
   * done. The app rotates the refresh-token cookie on every page mount (see
   * client/src/auth/AuthContext.tsx), so the context's storage state right
   * before it closes is the only copy still guaranteed current — snapshot
   * it and hand it to whichever test in this slot runs next.
   */
  async releaseSession(persona: PersonaKey, context: BrowserContext): Promise<void> {
    const state = await context.storageState();
    this.writeCachedState(persona, state);
  }

  private async resolveState(persona: PersonaKey): Promise<ResolvedSession> {
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
   * Confirms a cached session is still accepted by the server and picks up
   * its current (possibly already-rotated) cookie, via a single lightweight
   * API call — no browser page, no navigation, no rendering. This is
   * deliberately not a page-based check: POST /api/auth/refresh is exactly
   * what the app itself uses to answer "is this session valid", it isn't
   * subject to the login rate limiter (only POST /api/auth/login is —
   * server/routes/auth.routes.js), and an HTTP status code is a direct,
   * deterministic signal, unlike inferring validity from where a page
   * happened to redirect to. Uses its own scratch APIRequestContext (not the
   * shared per-test `request` fixture) so this persona's cookie can never
   * leak into or be contaminated by another persona's calls in the same test.
   */
  private async refreshCachedState(persona: PersonaKey, state: StorageState): Promise<ResolvedSession | null> {
    let scratch: APIRequestContext | undefined;
    try {
      scratch = await apiRequest.newContext({ baseURL: this.config.baseURL, storageState: state });
      const response = await scratch.post(this.config.refreshEndpoint, { timeout: this.config.requestTimeoutMs });
      if (!response.ok()) return null;
      const body: unknown = await response.json().catch(() => null);
      const refreshedState = await scratch.storageState();
      return { state: refreshedState, accessToken: isLoginResponseBody(body) ? body.accessToken ?? null : null };
    } catch {
      return null;
    } finally {
      await scratch?.dispose();
    }
  }

  /**
   * Logs in fresh. Retries only a transient (network-level) failure, up to
   * AuthConfig.maxRecoveryAttempts times — an AuthenticationError (bad
   * credentials, rate limited, any non-2xx response) is never retried, since
   * retrying can't fix a wrong password and would only make a rate limit
   * worse.
   */
  private async login(persona: PersonaKey): Promise<ResolvedSession> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.config.maxRecoveryAttempts; attempt++) {
      try {
        return await this.performLogin(persona);
      } catch (error) {
        if (error instanceof AuthenticationError) throw error;
        lastError = error;
        this.logger.warn(
          `[RECOVERY] transient error logging in persona "${persona}" (slot ${this.slot}), ` +
            `attempt ${attempt}/${this.config.maxRecoveryAttempts}: ${describeError(error)}`
        );
      }
    }
    this.logger.error(
      `[RECOVERY FAILED] persona=${persona} slot=${this.slot} — login did not succeed after ${this.config.maxRecoveryAttempts} attempt(s).`
    );
    throw new AuthenticationError(
      `Persona "${persona}" (slot ${this.slot}) could not log in after ${this.config.maxRecoveryAttempts} attempt(s): ${describeError(lastError)}`
    );
  }

  private async performLogin(persona: PersonaKey): Promise<ResolvedSession> {
    const credentials = this.personas[persona];
    if (!credentials) {
      throw new AuthenticationError(`No credentials configured for persona "${persona}".`);
    }

    const scratch = await apiRequest.newContext({ baseURL: this.config.baseURL });
    try {
      const response = await scratch.post(this.config.loginEndpoint, {
        data: { tenantCode: this.config.tenantCode, email: credentials.email, password: credentials.password },
        timeout: this.config.requestTimeoutMs,
      });
      if (!response.ok()) {
        throw new AuthenticationError(
          `Login failed for persona "${persona}" (slot ${this.slot}): ${response.status()} ${await response.text()}`
        );
      }

      const body: unknown = await response.json().catch(() => null);
      if (isLoginResponseBody(body) && body.user?.id) {
        this.persistUserInfo(persona, body.user.id, body.user.name, body.user.email);
      }

      this.logger.info(`[LOGIN] persona=${persona} slot=${this.slot}`);
      const state = await scratch.storageState();
      this.writeCachedState(persona, state);
      return { state, accessToken: isLoginResponseBody(body) ? body.accessToken ?? null : null };
    } finally {
      await scratch.dispose();
    }
  }

  private persistUserInfo(persona: PersonaKey, id: number, name: string, email: string): void {
    try {
      fs.writeFileSync(this.personaUserFile(persona), JSON.stringify({ id, name, email }));
    } catch (error) {
      this.logger.warn(
        `[CACHE WRITE FAILED] persona=${persona} slot=${this.slot} — could not persist user info (${describeError(error)}); continuing without it.`
      );
    }
  }

  private filePath(persona: PersonaKey): string {
    return path.join(this.config.authDir, `${persona}.slot${this.slot}.json`);
  }

  private readCachedState(persona: PersonaKey): StorageState | null {
    const file = this.filePath(persona);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as StorageState;
    } catch {
      this.logger.warn(`[CACHE MISS] persona=${persona} slot=${this.slot} — cached file was corrupted; ignoring it.`);
      return null;
    }
  }

  /**
   * Persisting the cache is an optimization, not a correctness requirement —
   * the caller already has a valid `state` in memory regardless of whether
   * this write succeeds. A read-only filesystem or a full disk should cost
   * the next test in this slot a fresh login, not fail the current one.
   */
  private writeCachedState(persona: PersonaKey, state: StorageState): void {
    try {
      fs.mkdirSync(this.config.authDir, { recursive: true });
      fs.writeFileSync(this.filePath(persona), JSON.stringify(state));
    } catch (error) {
      this.logger.warn(
        `[CACHE WRITE FAILED] persona=${persona} slot=${this.slot} — could not persist session cache (${describeError(error)}); continuing without it.`
      );
    }
  }

  private deleteCachedState(persona: PersonaKey): void {
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
