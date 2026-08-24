import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';

// quiet: true suppresses dotenv's random self-promo "tip" console lines.
dotenv.config({ path: path.resolve(__dirname, 'e2e/.env.e2e'), quiet: true });

/**
 * Employee Master E2E suite.
 * Targets the deployed dev environment (no local server/CORS wiring needed).
 * Override via env vars — see e2e/.env.e2e.example.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'https://test.mywehr.com';

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Capped rather than left to Playwright's CPU-based default. Login cost is
  // now (workers * personas actually used) ONE TIME per run, not per test and
  // not per failure — see e2e/auth/AuthenticationManager.ts. A worker process
  // being recycled after a test failure no longer triggers a fresh login: it
  // reads its own slot's cached session file instead. With 5 personas, this
  // value directly sets the one-time login cost against the server's login
  // rate limiter (20 per 15 min per IP — server/routes/auth.routes.js): e.g.
  // 3 workers * 5 personas = 15, comfortably under budget. Raise this freely;
  // just keep (workers * personas) under ~20 for a single clean run, or lower
  // if you're also running other suites against the same IP concurrently.
  workers: process.env.CI ? 2 : 3,
  // Runs once before any worker starts — see e2e/global-setup.ts. Governs
  // whether cached persona sessions persist across separate `npm run e2e`
  // invocations (E2E_REUSE_AUTH=true) or are cleared at the start of every
  // run (default).
  globalSetup: './e2e/global-setup.ts',
  // 'html' gives an immediate per-run view (overwritten every invocation —
  // see e2e/README.md's "Running module-by-module" section). 'blob' always
  // appends a uniquely-named result file to e2e/blob-report instead of
  // overwriting, so running spec files separately still lets you produce one
  // combined report afterwards via `npm run e2e:merge`.
  reporter: process.env.CI
    ? [['html', { outputFolder: 'e2e/report', open: 'never' }], ['blob', { outputDir: 'e2e/blob-report' }], ['github']]
    : [['html', { outputFolder: 'e2e/report', open: 'never' }], ['blob', { outputDir: 'e2e/blob-report' }], ['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Wide enough that the Employees DataGrid (10 data columns + a 260px
        // Actions column) renders in full without MUI's horizontal column
        // virtualization kicking in — at devices['Desktop Chrome']'s default
        // (1280x720, which a bare top-level `use.viewport` can't override
        // since project-level `use` wins the merge) the Actions column's
        // buttons get virtualized out of the DOM entirely until the grid is
        // scrolled right, and repeated live runs showed the virtualization
        // boundary re-settling unpredictably under rapid programmatic
        // scroll, causing flaky/hanging row-action clicks. Must be set here,
        // after the devices() spread, not in the top-level `use` block.
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
});
