import { test, expect } from '../fixtures/auth';
import { readPersonaUser } from '../fixtures/personas';
import { uniqueWeekdayRange } from '../fixtures/leave-data';
import { UNKNOWN_TRANSCRIPT, addHolidayTranscript, VOICE_GENERATED_HOLIDAY_NAME } from '../fixtures/voice-data';
import { dispatchVoiceIntentEvent, mockSpeechRecognition, mockNoSpeechRecognitionSupport, createPendingLeaveForVoiceTest } from '../helpers/voice';
import { getHolidaysApi, type HolidayRow } from '../helpers/holidays';
import { VoiceConfirmationModal } from '../pages/components/VoiceConfirmationModal';

/**
 * docs/VoiceCommands_TestCases.csv — UI rows driven through the REAL
 * `VoiceConfirmationModal` component and `AppShell`'s `voiceIntentParsed`
 * listener, not raw `page.request.*` calls. Automates: VC-FN-05, VC-FN-06
 * (UI half — VC-FN-06's /intent-parsing half is in
 * voice-commands-api-contracts.spec.ts), VC-UI-01 (partial — see below),
 * VC-UI-02, VC-UI-04, VC-UI-05, VC-UI-06.
 *
 * Also finally exercises `leave-permissions.spec.ts`'s deliberately-deferred
 * `LV-FN-12` placeholder ("driving APPROVE_LEAVE/REJECT_LEAVE via the voice
 * interface requires the Voice Commands module's speech-recognition UI...
 * not mapped in this pass — a dedicated Voice Commands automation effort
 * should own this").
 *
 * **Two distinct techniques, both genuinely UI-driven, used deliberately per test:**
 *
 * 1. `helpers/voice.ts`'s `mockSpeechRecognition()`/`mockNoSpeechRecognitionSupport()`
 *    — installs a fake `window.SpeechRecognition` via `page.addInitScript()`
 *    BEFORE `useVoiceCommands.js`'s own feature-detect runs, so a REAL click
 *    on the REAL mic button drives the REAL hook, which calls the REAL
 *    `POST /voice/intent`, which dispatches the REAL `voiceIntentParsed`
 *    event exactly as production code does. Only the literal audio-to-text
 *    step is simulated — this is the standard technique for testing a
 *    Web-Speech-API-based UI without a real microphone. Used for every test
 *    that's actually ABOUT the mic/listening UI itself (VC-UI-01/02/04/05)
 *    and for one full-pipeline smoke test (mic click all the way through to
 *    a real POST /voice/execute).
 * 2. `dispatchVoiceIntentEvent()` — skips straight to dispatching the
 *    post-parse event directly, bypassing both the (mocked) mic AND the real
 *    `/voice/intent` parse. Used only where a test needs to control the
 *    EXACT entities/intent shape deterministically (VC-UI-06's precise
 *    modal-content check, VC-FN-05's execute-call-counting, VC-FN-06's
 *    SHOW_TEAM navigation, and LV-FN-12's leave-approval end state) rather
 *    than depend on Fuse/chrono-node's live fuzzy-match/date-parse output
 *    landing exactly right — both are already independently proven correct
 *    by voice-commands-api-contracts.spec.ts's VC-FN-01/07/08.
 */
test.describe('Voice Commands — Lifecycle (UI)', () => {
  test('VC-UI-01 (partial): the mic button renders unconditionally for the lowest-privilege configured persona — TopNav has no hasPermission(\'voice.use\') gate of any kind', { tag: ['@sanity'] }, async ({ employeeSelfPage }) => {
    await employeeSelfPage.goto('/dashboard');
    // aria-label = the Tooltip's own title text (MUI's describeChild default — see e2e/README.md's Design Notes).
    // Confirms the button renders for the least-privileged of this suite's 5 personas; whether it's specifically
    // gated behind voice.use itself (none of the 5 lack it, live-verified) can't be shown further — see
    // voice-commands-not-automatable.spec.ts.
    await expect(employeeSelfPage.getByRole('button', { name: 'Ask the AI assistant' })).toBeVisible();
  });

  test('VC-UI-02: a real click on the mic, with a (mocked) recognizer active, flips the tooltip to "Stop listening" and shows a live transcript tooltip once a result arrives', { tag: ['@regression'] }, async ({ adminPage }) => {
    await mockSpeechRecognition(adminPage, { finalTranscript: UNKNOWN_TRANSCRIPT });
    await adminPage.goto('/dashboard');
    const micButton = adminPage.getByRole('button', { name: 'Ask the AI assistant' });
    await micButton.waitFor({ state: 'visible' });
    await micButton.click();

    await expect(adminPage.getByRole('button', { name: 'Stop listening' })).toBeVisible();
    // The floating interim/final transcript tooltip (TopNav.tsx: `{isListening && transcript && (<Paper>...)}`).
    await expect(adminPage.getByText(UNKNOWN_TRANSCRIPT)).toBeVisible();
  });

  test('VC-UI-04 (confirmed gap): with no Web Speech API implementation at all, the mic button still renders and remains silently clickable — toggleListening() no-ops with zero user-visible feedback, not even an error state', { tag: ['@regression'] }, async ({ adminPage }) => {
    await mockNoSpeechRecognitionSupport(adminPage);
    let dialogFired = false;
    adminPage.on('dialog', async (d) => { dialogFired = true; await d.dismiss(); });

    await adminPage.goto('/dashboard');
    const micButton = adminPage.getByRole('button', { name: 'Ask the AI assistant' });
    await expect(micButton).toBeVisible(); // still renders, unlike a feature-detected UI that would hide/disable it
    await micButton.click();

    // recognitionRef.current stayed null (useVoiceCommands.js's own `if (!SpeechRecognition) return`), so
    // toggleListening()'s `if (!recognitionRef.current) return` makes the click a pure no-op: no state flip, no dialog.
    await expect(adminPage.getByRole('button', { name: 'Stop listening' })).toHaveCount(0);
    expect(dialogFired).toBe(false);
  });

  test('VC-UI-05: a genuine Speech API network error triggers the one user-visible error path anywhere in this feature — a browser alert()', { tag: ['@regression'] }, async ({ adminPage }) => {
    await mockSpeechRecognition(adminPage, { errorType: 'network' });
    let alertMessage = '';
    adminPage.on('dialog', async (d) => { alertMessage = d.message(); await d.accept(); });

    await adminPage.goto('/dashboard');
    const micButton = adminPage.getByRole('button', { name: 'Ask the AI assistant' });
    await micButton.waitFor({ state: 'visible' });
    await micButton.click();

    await expect.poll(() => alertMessage).toContain('couldn\'t connect to the speech servers');
    // onerror also calls setIsListening(false) — the tooltip reverts, proving the UI doesn't get stuck in a "still listening" state after the error.
    await expect(adminPage.getByRole('button', { name: 'Ask the AI assistant' })).toBeVisible();
  });

  test('Full pipeline smoke: a real mic click, through a mocked Speech API, drives a real POST /voice/intent parse and a real POST /voice/execute on Confirm — only the audio-to-text step is simulated', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const { start: date } = uniqueWeekdayRange(46);
    await mockSpeechRecognition(adminPage, { finalTranscript: addHolidayTranscript(date) });
    await adminPage.goto('/dashboard');
    const micButton = adminPage.getByRole('button', { name: 'Ask the AI assistant' });
    await micButton.waitFor({ state: 'visible' });
    await micButton.click();

    const modal = new VoiceConfirmationModal(adminPage);
    await modal.waitForOpen();
    await modal.confirm();
    await modal.expectClosed();

    const rows: HolidayRow[] = await (await getHolidaysApi(adminPage)).json();
    expect(rows.some((r) => r.name === VOICE_GENERATED_HOLIDAY_NAME && r.date.slice(0, 10) === date)).toBe(true);
  });

  test('VC-FN-06 (UI half): SHOW_TEAM navigates immediately with no confirmation modal and no /voice/execute call', { tag: ['@regression'] }, async ({ managerPage }) => {
    await managerPage.goto('/dashboard');
    let executeCalled = false;
    managerPage.on('request', (req) => {
      if (req.url().includes('/api/voice/execute')) executeCalled = true;
    });

    await dispatchVoiceIntentEvent(managerPage, { transcript: 'show team employee list', intent: 'SHOW_TEAM', entities: {} });
    await managerPage.waitForURL(/\/employees/);

    const modal = new VoiceConfirmationModal(managerPage);
    await expect(modal.dialog).not.toBeVisible();
    expect(executeCalled).toBe(false);
  });

  test('VC-FN-05: a modifying intent (ADD_HOLIDAY) always shows VoiceConfirmationModal first, and /voice/execute is never called until Confirm is explicitly clicked', { tag: ['@smoke'] }, async ({ adminPage }) => {
    await adminPage.goto('/dashboard');
    let executeCallCount = 0;
    adminPage.on('request', (req) => {
      if (req.url().includes('/api/voice/execute') && req.method() === 'POST') executeCallCount++;
    });

    const { start: date } = uniqueWeekdayRange(44);
    await dispatchVoiceIntentEvent(adminPage, {
      transcript: `add holiday on ${date}`,
      intent: 'ADD_HOLIDAY',
      entities: { date, location: null },
    });

    const modal = new VoiceConfirmationModal(adminPage);
    await modal.waitForOpen();
    expect(executeCallCount).toBe(0); // never called just from parsing/confirming-modal-open

    const [response] = await Promise.all([
      adminPage.waitForResponse((res) => res.url().includes('/api/voice/execute') && res.request().method() === 'POST'),
      modal.confirm(),
    ]);
    expect(response.ok()).toBeTruthy();
    expect(executeCallCount).toBe(1);
    await modal.expectClosed();
  });

  test('VC-UI-06 (confirmed gap): the confirmation modal shows only the resolved name/date description — no leave id, date-range, leave-type detail, or raw-transcript-vs-resolved-entity comparison a user could use to catch a bad fuzzy match before confirming', { tag: ['@regression'] }, async ({ adminPage }) => {
    const self = readPersonaUser('employeeSelf');
    test.skip(!self, 'employeeSelf persona not configured.');

    await adminPage.goto('/dashboard');
    const misheardTranscript = 'approve leave for a totally different phrase than what gets shown';
    await dispatchVoiceIntentEvent(adminPage, {
      transcript: misheardTranscript,
      intent: 'APPROVE_LEAVE',
      entities: { user: { id: self!.id, name: self!.name }, date: '2026-09-15' },
    });

    const modal = new VoiceConfirmationModal(adminPage);
    await modal.waitForOpen();
    await modal.expectDescription(`Approve leave for ${self!.name} on 2026-09-15`);
    // The original transcript the (simulated) speech recognizer actually heard is never surfaced anywhere in the
    // dialog for comparison against the resolved entities above it — confirming VC-UI-06's gap structurally.
    await expect(modal.dialog).not.toContainText(misheardTranscript);
    await modal.cancel();
    await modal.expectClosed();
  });

  test('LV-FN-12: APPROVE_LEAVE driven end-to-end through the real voice UI — confirmation modal, Confirm click, real POST /voice/execute — reaches the identical Approved end state as the manual PATCH path (LV-AP-04/LV-AP-06)', { tag: ['@smoke'] }, async ({ adminPage, employeeSelfPage }) => {
    const self = readPersonaUser('employeeSelf');
    test.skip(!self, 'employeeSelf persona not configured.');

    const { start } = await createPendingLeaveForVoiceTest(employeeSelfPage, self!.id, 'LV-FN-12 voice UI lifecycle');

    await adminPage.goto('/dashboard');
    await dispatchVoiceIntentEvent(adminPage, {
      transcript: `approve leave for ${self!.name} on ${start}`,
      intent: 'APPROVE_LEAVE',
      entities: { user: { id: self!.id, name: self!.name }, date: start },
    });

    const modal = new VoiceConfirmationModal(adminPage);
    await modal.waitForOpen();
    await modal.expectDescription(new RegExp(`Approve leave for ${self!.name} on`));
    await modal.confirm();
    await modal.expectClosed();

    const rows = await (await adminPage.request.get(`/api/leaves?userId=${self!.id}`)).json();
    const match = rows.find((r: { start_date: string; status: string }) => new Date(r.start_date).toISOString().slice(0, 10) === start);
    expect(match?.status).toBe('Approved');
  });
});
