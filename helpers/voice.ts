/**
 * Shared "arrange"/API helpers for the Voice Commands suite
 * (docs/VoiceCommands_TestCases.csv). No existing helper file touches
 * /voice/intent or /voice/execute — per FRAMEWORK_GUIDELINES.md this gets
 * its own file rather than being bolted onto leave.ts/holidays.ts, even
 * though several tests exercise leave/holiday side effects through it.
 *
 * Two distinct interaction modes, both legitimate:
 *  - `postVoiceIntentApi`/`postVoiceExecuteApi` — raw `page.request.*` calls,
 *    the same shape as every other module's API-contract helpers.
 *  - `dispatchVoiceIntentEvent` — a genuine UI-driving helper. The real
 *    Web Speech API (`window.SpeechRecognition`) cannot be scripted by
 *    Playwright (no real microphone/audio in a Chromium test run — see
 *    voice-commands-not-automatable.spec.ts), but `client/src/layout/AppShell.tsx`'s
 *    `handleVoiceIntent` listener is a plain `window.addEventListener('voiceIntentParsed', ...)`
 *    that only ever reads `(event as CustomEvent).detail` — exactly the shape
 *    `useVoiceCommands.js`'s `processCommand` dispatches after a real
 *    POST /voice/intent response. Dispatching that same CustomEvent directly
 *    genuinely drives AppShell's real state (`pendingVoiceAction`), mounting
 *    the real `VoiceConfirmationModal` and, on Confirm, hitting the real
 *    POST /voice/execute through the component's own `processVoiceExecution`
 *    call — the only part of the voice pipeline this suite cannot reach is
 *    the transcript-to-text step itself, confirmed by reading both files
 *    directly rather than assumed.
 */
import { type APIResponse, type Page } from '@playwright/test';
import { assertOk } from './rbac';
import { toIso } from '../fixtures/leave-data';

export interface VoiceEntities {
  date?: string | null;
  user?: { id: number; name: string } | null;
  location?: { id: number; name: string } | null;
  leaveCategory?: { id: string; name: string } | null;
}

export interface VoiceIntentResponse {
  transcript: string;
  intent: string;
  entities: VoiceEntities;
}

/** POST /api/voice/intent — raw, doesn't assert. Requires voice.use. */
export function postVoiceIntentApi(page: Page, transcript: string): Promise<APIResponse> {
  return page.request.post('/api/voice/intent', { data: { transcript } });
}

/** POST /api/voice/execute — raw, doesn't assert. Requires voice.use, plus an intent-specific inline permission check (leaves.approve/holidays.manage). */
export function postVoiceExecuteApi(page: Page, data: { intent: string; entities?: Partial<VoiceEntities>; transcript?: string }): Promise<APIResponse> {
  return page.request.post('/api/voice/execute', { data });
}

/** Asserted convenience wrapper around postVoiceIntentApi — the common "arrange" shape most tests need. */
export async function parseVoiceIntent(page: Page, transcript: string): Promise<VoiceIntentResponse> {
  const response = await postVoiceIntentApi(page, transcript);
  assertOk(response);
  return response.json();
}

/**
 * Dispatches the exact CustomEvent AppShell.tsx listens for, as if a real
 * POST /voice/intent response had just come back from speech input. `page`
 * must already be on a route that mounts AppShell (any authenticated page
 * inside the app shell, e.g. after `.goto('/dashboard')`) — the listener is
 * registered in AppShell's own `useEffect`, not globally.
 *
 * Waits for TopNav's mic IconButton to be visible first — a proxy signal
 * that AppShell has actually mounted and its `useEffect` has run (React
 * hydration after a fresh `.goto()` isn't otherwise synchronous with the
 * navigation's own load event), rather than racing the listener's
 * registration on a bare `page.evaluate()` right after navigation.
 */
export async function dispatchVoiceIntentEvent(page: Page, data: VoiceIntentResponse): Promise<void> {
  await page.getByRole('button', { name: /Ask the AI assistant|Stop listening/ }).waitFor({ state: 'visible' });
  await page.evaluate((detail) => {
    window.dispatchEvent(new CustomEvent('voiceIntentParsed', { detail }));
  }, data);
}

/**
 * Installs a fake `window.SpeechRecognition`/`webkitSpeechRecognition`
 * BEFORE any page script runs (`page.addInitScript`), so `useVoiceCommands.js`'s
 * own feature-detect (`window.SpeechRecognition || window.webkitSpeechRecognition`)
 * finds it and wires the real hook up to it exactly as it would a real
 * browser implementation — real `.start()`/`.stop()`/`onstart`/`onresult`/
 * `onerror`/`onend` contract, matching the Web Speech API shape the hook
 * actually consumes (confirmed by reading `useVoiceCommands.js` directly).
 *
 * This is the one legitimate way to automate the mic UI itself without a
 * real microphone: mock the browser API surface, not the app's own logic.
 * Once `.start()` is called (by a real click on the mic button), the fake:
 *  - with `finalTranscript` set, fires a real `onresult` final-result event
 *    shaped exactly like the browser's own (`results[i].isFinal` +
 *    `results[i][0].transcript`) — driving the REAL `processCommand()` →
 *    REAL `POST /voice/intent` → REAL `voiceIntentParsed` dispatch, the
 *    entire pipeline except the literal audio-to-text step;
 *  - with `errorType` set instead, fires a real `onerror` event — e.g.
 *    `{error: 'network'}`, reproducing VC-UI-05's browser `alert()` path.
 *  - with neither set (the default, no options), simulates a browser with
 *    NO Web Speech API at all by never defining the globals in the first
 *    place — see `mockNoSpeechRecognitionSupport()` below for that case
 *    specifically, since it's a different code path (the hook's own
 *    feature-detect `if (!SpeechRecognition) return`) than this function's.
 */
export async function mockSpeechRecognition(page: Page, options: { finalTranscript?: string; errorType?: string } = {}): Promise<void> {
  await page.addInitScript(({ finalTranscript, errorType }) => {
    class FakeSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onstart: (() => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        this.onstart?.();
        if (errorType) {
          setTimeout(() => this.onerror?.({ error: errorType }), 0);
          return;
        }
        if (finalTranscript) {
          const finalResult = Object.assign([{ transcript: finalTranscript }], { isFinal: true });
          setTimeout(() => this.onresult?.({ resultIndex: 0, results: [finalResult] }), 0);
        }
      }

      stop() {
        this.onend?.();
      }
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeSpeechRecognition;
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeSpeechRecognition;
  }, options);
}

/**
 * `page` must be the target user's OWN session — POST /api/leaves only ever
 * lands a new row as Pending when `targetUserId === requesterId` (a genuine
 * self-application); applying on someone else's behalf (any caller holding
 * `leaves.apply.any`, e.g. an admin persona acting on a disposable employee)
 * auto-approves instantly instead (`isAdminSubmission` in leaves.routes.js —
 * confirmed live), which is useless as setup for a test that specifically
 * needs a PENDING leave for voice APPROVE_LEAVE/REJECT_LEAVE to act on.
 */
const LEAVE_TYPES_TO_TRY = ['Paid', 'Sick', 'Casual'];

/**
 * A Monday roughly `baseDaysOut + attempt * 60` days out, NOT drawn from
 * `uniqueWeekdayRange()`'s shared, ~300-day/43-Monday jitter pool
 * (`fixtures/leave-data.ts`'s module-level `callCounter`) — deliberately.
 * Every OTHER call to that pool, across every module and every rerun of
 * this suite within the same dev cycle, competes for the same bounded set
 * of Mondays; `employeeSelf`'s own leave rows (never deleted — see
 * FRAMEWORK_GUIDELINES.md's Cleanup strategy) accumulate there permanently,
 * and repeated stabilization reruns of THIS module alone were enough to
 * start colliding with its own earlier runs' leftover rows ("You already
 * have a leave request overlapping these dates," confirmed live).
 * A wide `Math.random()`-based spread (not a `Date.now()` bucket — confirmed
 * live that a millisecond-granularity jitter still isn't enough separation
 * between two calls issued a few seconds apart in the same run, e.g.
 * `voice-commands-lifecycle.spec.ts`'s LV-FN-12 and
 * `voice-commands-permissions-security.spec.ts`'s VC-NG-11 colliding on the
 * same Monday) keeps every call — across every test file AND every rerun —
 * landing in a ~700-day-wide, ~100-Monday pool essentially disjoint from
 * both the shared `uniqueWeekdayRange()` pool and this helper's own past
 * runs.
 */
function farFutureMonday(minDaysOut: number, spreadDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + minDaysOut + Math.floor(Math.random() * spreadDays));
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return toIso(d);
}

/**
 * Creates a single-day Pending leave for `userId` (== the caller's own id —
 * see above), as setup for a test that needs one for voice
 * APPROVE_LEAVE/REJECT_LEAVE to act on. Retries across both a freshly
 * re-jittered date AND a rotating leave type, since this suite's fixed
 * personas accumulate real, permanent usage against their own finite yearly
 * allocations across every module's entire test history — an already-
 * documented, accepted exhaustion risk (FRAMEWORK_GUIDELINES.md's Cleanup
 * strategy) — confirmed live (2026-08-17): `employeeSelf`'s Casual balance
 * alone was already exhausted ("Insufficient leave balance") by the time
 * this module's own setup ran. Separately, `uniqueWeekdayRange()`'s Monday-
 * anchored dates, despite never landing on a Sunday themselves, can still
 * collide with a pre-existing HOLIDAY row in this shared, ever-growing
 * tenant — `isHolidayOrWeekend()` (leaves.routes.js) blocks on ANY holiday
 * tenant-wide regardless of location, the already-registered `HL-001`
 * defect (docs/HRMS_PRODUCT_DEFECT_REGISTER.md). Neither is a new defect to
 * re-register here — both are real, growing sources of setup flakiness this
 * suite's Leave-adjacent tests now have to route around, the same way a
 * network-level transient failure is retried (`helpers/networkResilience.ts`)
 * rather than asserted against.
 */
export async function createPendingLeaveForVoiceTest(page: Page, userId: number, reasonTag: string): Promise<{ start: string }> {
  const maxAttempts = 6;
  const RECOVERABLE_ERRORS = ['You cannot select a Sunday or Holiday as start/end date.', 'Insufficient leave balance'];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const type = LEAVE_TYPES_TO_TRY[attempt % LEAVE_TYPES_TO_TRY.length];
    const start = farFutureMonday(700, 5000);
    const response = await page.request.post('/api/leaves', {
      data: { user_id: userId, type, start_date: start, end_date: start, reason: `E2E: ${reasonTag}` },
    });
    if (response.ok()) return { start };
    const body = await response.json().catch(() => ({}));
    if (!RECOVERABLE_ERRORS.includes(body.error)) {
      throw new Error(`createPendingLeaveForVoiceTest(): unexpected failure creating the setup leave (attempt ${attempt + 1}, type ${type}) — ${response.status()} ${JSON.stringify(body)}`);
    }
  }
  throw new Error(`createPendingLeaveForVoiceTest(): exhausted ${maxAttempts} attempts across ${LEAVE_TYPES_TO_TRY.join('/')} — every combination hit a holiday collision (HL-001) or an exhausted balance.`);
}

/**
 * Simulates a browser with NO Web Speech API implementation at all (VC-UI-04)
 * by explicitly deleting both globals before any page script runs — needed
 * because Playwright's own Chromium DOES implement `webkitSpeechRecognition`
 * by default, so the "unsupported browser" case has to be forced rather than
 * being Chromium's natural state.
 */
export async function mockNoSpeechRecognitionSupport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'SpeechRecognition');
    Reflect.deleteProperty(window, 'webkitSpeechRecognition');
  });
}
