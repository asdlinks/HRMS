import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import type { PlatformAdminAuthConfig } from '../config/platformAdminAuth.config';
import type { PlatformAdminPersonaCreds, PlatformAdminPersonaKey, PlatformAdminPersonaUserInfo } from '../fixtures/platformAdminPersonas';
// Re-exported, not redefined — AuthenticationError/SessionExpiredError are
// generic (no tenant-specific shape) and helpers/sessionGuard.ts's
// SessionExpiredError-consuming utilities work against any BrowserContext,
// so the platform-admin fixture reuses the exact same error classes rather
// than duplicating them.
export { AuthenticationError, SessionExpiredError } from './types';

/** A Playwright storage state snapshot — cookies plus per-origin localStorage. */
export type PlatformAdminStorageState = Awaited<ReturnType<APIRequestContext['storageState']>>;

export interface PlatformAdminAuthLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createConsolePlatformAdminAuthLogger(verbose: boolean): PlatformAdminAuthLogger {
  return {
    debug: verbose ? (message: string) => console.log(`[PlatformAdminAuthenticationManager] ${message}`) : () => undefined,
    info: (message: string) => console.log(`[PlatformAdminAuthenticationManager] ${message}`),
    warn: (message: string) => console.warn(`[PlatformAdminAuthenticationManager] ${message}`),
    error: (message: string) => console.error(`[PlatformAdminAuthenticationManager] ${message}`),
  };
}

export interface PlatformAdminAuthenticationManagerDependencies {
  config: PlatformAdminAuthConfig;
  slot: number;
  personas: Record<PlatformAdminPersonaKey, PlatformAdminPersonaCreds | null>;
  personaUserFile: (persona: PlatformAdminPersonaKey) => string;
  logger?: PlatformAdminAuthLogger;
}

export interface PlatformAdminAcquiredSession {
  context: BrowserContext;
  page: Page;
}

/**
 * Mirrors ResolvedSession (./types.ts) for the platform-admin stack: the
 * app's own PlatformAdminAuthContext (client/src/platform-admin/auth/
 * PlatformAdminAuthContext.tsx) also never persists the access token to a
 * cookie or localStorage — module-level JS variable only
 * (api/platformAdminClient.ts) — so the same "thread the token through to
 * extraHTTPHeaders" approach is required for page.request/context.request
 * calls to authenticate at all.
 */
export interface PlatformAdminResolvedSession {
  state: PlatformAdminStorageState;
  accessToken: string | null;
}

/** Shape of a successful /auth/login or /auth/refresh response body. */
export interface PlatformAdminLoginResponseBody {
  admin?: PlatformAdminPersonaUserInfo;
  accessToken?: string;
}

export function isPlatformAdminLoginResponseBody(value: unknown): value is PlatformAdminLoginResponseBody {
  return typeof value === 'object' && value !== null;
}
