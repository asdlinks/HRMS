import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import type { PersonaCreds, PersonaKey, PersonaUserInfo } from '../fixtures/personas';
import type { AuthConfig } from '../config/auth.config';

/** A Playwright storage state snapshot — cookies plus per-origin localStorage. */
export type StorageState = Awaited<ReturnType<APIRequestContext['storageState']>>;

export interface AuthLogger {
  /** Routine, high-frequency events (cache hit, session still valid) — silent unless AuthConfig.verboseLogging. */
  debug(message: string): void;
  /** Noteworthy, infrequent lifecycle events (login, cache miss, recovery). */
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Default console logger. `debug` is a no-op unless `verbose` is true, so a
 * normal run only prints the events worth noticing (a real login, a session
 * expiring and recovering, a failure) — not one line per cache hit across
 * hundreds of tests.
 */
export function createConsoleAuthLogger(verbose: boolean): AuthLogger {
  return {
    debug: verbose ? (message: string) => console.log(`[AuthenticationManager] ${message}`) : () => undefined,
    info: (message: string) => console.log(`[AuthenticationManager] ${message}`),
    warn: (message: string) => console.warn(`[AuthenticationManager] ${message}`),
    error: (message: string) => console.error(`[AuthenticationManager] ${message}`),
  };
}

export interface AuthenticationManagerDependencies {
  config: AuthConfig;
  /** Stable worker slot (Playwright's `parallelIndex`) this manager instance serves. */
  slot: number;
  /** Every persona this manager can authenticate, keyed by persona name. */
  personas: Record<PersonaKey, PersonaCreds | null>;
  /** Where to persist the logged-in user's id/name/email for a persona. */
  personaUserFile: (persona: PersonaKey) => string;
  logger?: AuthLogger;
}

export interface AcquiredSession {
  context: BrowserContext;
  page: Page;
}

/**
 * A resolved session's browser-visible storage state, plus the access token
 * that goes with it. The app (client/src/api/client.ts) deliberately never
 * persists the access token to a cookie or localStorage — it lives only in
 * an in-memory JS variable, attached to outgoing requests by an axios
 * interceptor that runs inside the page's own JS. `page.request`/`context.request`
 * calls bypass that interceptor entirely (they're a separate, Node-side HTTP
 * client — see Playwright's own docs on APIRequestContext), so without this,
 * every direct `page.request` call to an authenticated route 401s
 * ("Authentication required") even from a page that's genuinely logged in.
 * Threading the token through to `browser.newContext({ extraHTTPHeaders })`
 * is what makes `page.request` usable at all for this app's auth model —
 * see AuthenticationManager.acquireSession().
 */
export interface ResolvedSession {
  state: StorageState;
  accessToken: string | null;
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Thrown by `helpers/guards.ts`'s `assertSessionActive()` when a page has
 * been bounced to /login mid-test — a *different* failure mode from
 * `AuthenticationError` (which covers login/refresh itself failing before a
 * test ever gets a page). Distinguished so a test/CI log can tell "the
 * session went stale while the test was already running" apart from "this
 * persona couldn't log in at all" at a glance, and so a future automatic
 * recovery path (re-login + retry) can catch this specific error type
 * without accidentally swallowing an unrelated one.
 */
export class SessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export interface LoginResponseBody {
  user?: PersonaUserInfo;
  accessToken?: string;
}

export function isLoginResponseBody(value: unknown): value is LoginResponseBody {
  return typeof value === 'object' && value !== null;
}
