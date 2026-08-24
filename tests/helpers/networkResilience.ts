import type { BrowserContext } from '@playwright/test';

/**
 * Node/undici error messages for a dropped TCP connection — never a
 * server-returned status code. Playwright's request methods (`get`/`post`/
 * etc., which `page.request.*` is an alias for `context.request.*`) only
 * ever *reject* for a transport-level failure like these; any actual HTTP
 * response — including 400/401/403/404/409 — resolves normally as a
 * `Response` with `.ok() === false` and never reaches a catch block at all.
 * That means this list is the *entire* retry surface: there is no way for
 * this wrapper to accidentally retry a real 4xx/permission failure, because
 * it has no way to see one — Playwright never throws for those.
 */
const TRANSIENT_NETWORK_ERROR_PATTERNS: RegExp[] = [
  /ECONNRESET/i,
  /socket hang up/i,
  /ECONNREFUSED/i,
  /network socket disconnected/i,
];

function isTransientNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

const RETRYABLE_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch'] as const;

/**
 * Confirmed live (Payroll Framework Stabilization pass): PR-BD-03
 * (payroll-salary-assignments.spec.ts) failed with a raw
 * `apiRequestContext.get: read ECONNRESET` on `GET /api/users` against the
 * shared dev server — no HTTP response at all, indistinguishable from a real
 * bug except that an identical rerun of the same call succeeds. That's a
 * transport-level hiccup against a shared remote server under concurrent
 * load, not anything the test or the app got wrong.
 *
 * Wraps `context.request`'s HTTP methods once, at context-creation time
 * (`fixtures/auth.ts`'s `usePersonaPage()`), so every `adminPage.request.*`/
 * `managerPage.request.*`/etc. call across every spec file gets a bounded
 * number of retries on a genuine transient failure — with zero changes to
 * any spec file's own call sites. Each retry is logged (attempt number,
 * method, URL) so a rerun that needed one is visible in the run output
 * rather than silently invisible.
 */
export function installTransientRequestRetries(context: BrowserContext, maxAttempts = 3): void {
  // Cast to a plain string-keyed map of functions for the patching below —
  // APIRequestContext's real type has 7 individually-overloaded methods with
  // incompatible signatures, which TypeScript won't let a single generic
  // `(...args) => Promise<unknown>` satisfy all of at once. The cast is
  // confined to this one function; every caller still sees the real,
  // correctly-typed `APIRequestContext` on `context.request`.
  const request = context.request as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;

  for (const method of RETRYABLE_METHODS) {
    const original = request[method];
    if (typeof original !== 'function') continue;
    const boundOriginal = original.bind(request);

    request[method] = async (...args: unknown[]) => {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await boundOriginal(...args);
        } catch (error) {
          if (!isTransientNetworkError(error) || attempt === maxAttempts) throw error;
          const url = typeof args[0] === 'string' ? args[0] : String(args[0]);
          console.warn(
            `[NetworkResilience] transient network error on ${method.toUpperCase()} ${url} ` +
              `(attempt ${attempt}/${maxAttempts}): ${error instanceof Error ? error.message : String(error)} — retrying.`
          );
          // Brief, bounded backoff before retrying a dropped connection — not
          // a substitute for a real wait condition (nothing here is polling
          // for a signal), just politeness to a server that may be
          // transiently overloaded. Grows with attempt number so a second
          // retry doesn't immediately re-hit whatever just reset the socket.
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        }
      }
    };
  }
}
