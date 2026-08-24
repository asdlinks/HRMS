import path from 'path';

export interface PlatformAdminAuthConfig {
  /** Directory session files are read from / written to. Deliberately the
   * SAME directory as the tenant suite's `authConfig.authDir`
   * (e2e/.auth) — global-setup.ts clears every `<name>.slot<N>.json` file
   * in that one directory by a name-agnostic glob, so platform-admin
   * session files get the same "fresh every run by default" behavior for
   * free, with zero changes to global-setup.ts. */
  authDir: string;
  /** App origin used for both the login and refresh API calls — same origin
   * as the tenant suite's E2E_BASE_URL; Platform Admin is a same-origin
   * client route (client/src/platform-admin), not a separate host. */
  baseURL: string;
  loginEndpoint: string;
  refreshEndpoint: string;
  logoutEndpoint: string;
  changePasswordEndpoint: string;
  /** Timeout for the login/refresh HTTP calls themselves. */
  requestTimeoutMs: number;
  /**
   * How many times a LOGIN call is retried after a transient (network-level)
   * failure — connection errors, timeouts. Never applies to an auth-level
   * failure (bad credentials, rate-limited, locked, inactive): those fail
   * immediately, since retrying can't fix them and, for rate-limiting,
   * actively makes it worse — see PA-BD-01/PA-SC-07.
   */
  maxRecoveryAttempts: number;
  /** Set via E2E_AUTH_VERBOSE=true (shared with the tenant suite's own
   * verbose flag) to also print cache-hit/session-valid lines. */
  verboseLogging: boolean;
}

/**
 * Single source of truth for every value PlatformAdminAuthenticationManager
 * needs — mirrors config/auth.config.ts's role for the tenant suite, kept as
 * a wholly separate file/object rather than extending that one because the
 * two stacks genuinely differ in shape: no tenantCode (a platform admin
 * isn't tenant-scoped), different endpoints, different cookie/response
 * shape. See server/routes/platformAdmin/auth.routes.js for the endpoints
 * and server/middleware/platformAdminAuth.js for the token verification this
 * config's values ultimately drive.
 */
export const platformAdminAuthConfig: PlatformAdminAuthConfig = {
  authDir: path.resolve(__dirname, '../.auth'),
  baseURL: process.env.E2E_BASE_URL || 'https://test.mywehr.com',
  loginEndpoint: '/api/platform-admin/auth/login',
  refreshEndpoint: '/api/platform-admin/auth/refresh',
  logoutEndpoint: '/api/platform-admin/auth/logout',
  changePasswordEndpoint: '/api/platform-admin/auth/change-password',
  requestTimeoutMs: 15_000,
  maxRecoveryAttempts: 2,
  verboseLogging: process.env.E2E_AUTH_VERBOSE === 'true',
};
