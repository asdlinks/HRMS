import path from 'path';
import { TENANT_CODE } from '../fixtures/personas';

export interface AuthConfig {
  /** Directory session files are read from / written to. */
  authDir: string;
  /** App origin used for both the login and refresh API calls. */
  baseURL: string;
  /** Tenant slug sent with every login request. */
  tenantCode: string;
  loginEndpoint: string;
  refreshEndpoint: string;
  /** Timeout for the login/refresh HTTP calls themselves. */
  requestTimeoutMs: number;
  /**
   * How many times a LOGIN call is retried after a transient (network-level)
   * failure — connection errors, timeouts. Never applies to an auth-level
   * failure (bad credentials, rate-limited): those fail immediately, since
   * retrying can't fix them and, for rate-limiting, actively makes it worse.
   */
  maxRecoveryAttempts: number;
  /**
   * Default (false): e2e/global-setup.ts clears every cached session at the
   * start of each run, so every run authenticates fresh. Set via
   * E2E_REUSE_AUTH=true to let still-valid cached sessions carry over
   * between separate `npm run e2e` invocations instead — see
   * e2e/README.md's "Cross-run authentication behavior" section.
   */
  reuseAcrossRuns: boolean;
  /** Set via E2E_AUTH_VERBOSE=true to also print cache-hit/session-valid lines. */
  verboseLogging: boolean;
}

/**
 * Single source of truth for every value AuthenticationManager needs.
 * Nothing in AuthenticationManager.ts should hardcode a value that belongs
 * here — add new knobs to this file, not as inline literals in the class.
 *
 * The 'https://dev.mywetechnologies.com' fallback below is intentionally
 * duplicated in playwright.config.ts rather than imported from there (or
 * shared via a new file): both this module and personas.ts already read
 * env vars at import time (TENANT_CODE, PERSONAS), and TypeScript/Node
 * import statements are hoisted — importing anything from either into
 * playwright.config.ts would run that eager env-reading code before
 * playwright.config.ts's own dotenv.config() call populates process.env,
 * silently reverting E2E_BASE_URL/E2E_TENANT_CODE overrides to their
 * hardcoded fallbacks. If E2E_BASE_URL is set (as e2e/.env.e2e always sets
 * it), both fallbacks are dead code and can never diverge in practice; if
 * you ever change the fallback value, update it in both places.
 */
export const authConfig: AuthConfig = {
  authDir: path.resolve(__dirname, '../.auth'),
  baseURL: process.env.E2E_BASE_URL || 'https://test.mywehr.com',
  tenantCode: TENANT_CODE,
  loginEndpoint: '/api/auth/login',
  refreshEndpoint: '/api/auth/refresh',
  requestTimeoutMs: 15_000,
  maxRecoveryAttempts: 2,
  reuseAcrossRuns: process.env.E2E_REUSE_AUTH === 'true',
  verboseLogging: process.env.E2E_AUTH_VERBOSE === 'true',
};
