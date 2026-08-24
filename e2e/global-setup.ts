import fs from 'fs';
import path from 'path';
import type { FullConfig } from '@playwright/test';
import { authConfig } from './config/auth.config';

const SLOT_FILE_PATTERN = /^.+\.slot(\d+)\.json$/;

/**
 * Playwright global setup — runs once per `playwright test` invocation,
 * before any worker starts. Governs whether cached persona sessions
 * (e2e/.auth/<persona>.slot<N>.json, written by AuthenticationManager)
 * persist across separate runs. See e2e/README.md's "Cross-run
 * authentication behavior" section for the tradeoffs of each mode.
 *
 * Default (authConfig.reuseAcrossRuns === false): clear every session file,
 * so every run authenticates fresh rather than silently trusting a session
 * that might be days old from a prior run.
 *
 * E2E_REUSE_AUTH=true: skip the clear. AuthenticationManager's normal
 * validate-then-reuse logic still applies per slot, so a stale/expired
 * session self-heals with one extra login rather than causing a failure —
 * this mode simply lets a still-valid session skip that login entirely. In
 * this mode, session files for slots beyond the current run's `workers`
 * count are pruned (e.g. leftover admin.slot4.json after lowering workers
 * from 5 to 3) so stale files don't accumulate indefinitely across sessions
 * with different worker counts.
 */
export default function globalSetup(config: FullConfig): void {
  if (!fs.existsSync(authConfig.authDir)) return;

  if (authConfig.reuseAcrossRuns) {
    let pruned = 0;
    for (const entry of fs.readdirSync(authConfig.authDir)) {
      const match = SLOT_FILE_PATTERN.exec(entry);
      if (match && Number(match[1]) >= config.workers) {
        fs.rmSync(path.join(authConfig.authDir, entry), { force: true });
        pruned++;
      }
    }
    console.log(
      `[e2e] E2E_REUSE_AUTH=true — reusing cached persona sessions from previous runs where still valid` +
        (pruned > 0 ? ` (pruned ${pruned} file(s) from slots beyond the current worker count).` : '.')
    );
    return;
  }

  let cleared = 0;
  for (const entry of fs.readdirSync(authConfig.authDir)) {
    if (SLOT_FILE_PATTERN.test(entry)) {
      fs.rmSync(path.join(authConfig.authDir, entry), { force: true });
      cleared++;
    }
  }
  console.log(
    `[e2e] Default mode — cleared ${cleared} cached persona session(s); each persona logs in fresh this run.`
  );
}
