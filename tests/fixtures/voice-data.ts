/**
 * Data-driven fixtures for the Voice Commands suite (docs/VoiceCommands_TestCases.csv).
 * Kept in its own file per FRAMEWORK_GUIDELINES.md — no existing fixture file
 * touches /voice/intent or /voice/execute.
 *
 * Transcripts here are hand-built to satisfy server/voice_parser.js's own
 * keyword-matching heuristics exactly (confirmed by reading it): intent
 * matching is a plain `text.includes(...)` chain over the lowercased
 * transcript (e.g. `includes('approve') && includes('leave')`), and entity
 * extraction runs `compromise` (nouns/people/places) plus a `chrono-node`
 * date parse over the same text. A transcript that doesn't literally contain
 * the app's own trigger words won't resolve to the intent a test expects,
 * regardless of how a real speaker might phrase it.
 */
import { uniqueSuffix } from './test-data';

/**
 * A transcript matching no keyword in voice_parser.js's intent chain at all — resolves to intent: 'UNKNOWN'.
 * Deliberately avoids any chrono-node-resolvable date word (e.g. "today"/"tomorrow") — date extraction
 * (parseDate()) runs independently of intent matching, so a transcript with an incidental relative-date word
 * would still populate entities.date despite having no recognizable intent, confirmed live when an earlier
 * version of this constant ("...like today") did exactly that.
 */
export const UNKNOWN_TRANSCRIPT = 'please increase the font size on this screen';

export function approveLeaveTranscript(employeeName: string, dateText: string): string {
  return `approve leave for ${employeeName} on ${dateText}`;
}

export function rejectLeaveTranscript(employeeName: string, dateText: string): string {
  return `reject leave for ${employeeName} on ${dateText}`;
}

export function cancelLeaveTranscript(dateText: string): string {
  return `cancel my leave on ${dateText}`;
}

export function addHolidayTranscript(dateText: string): string {
  return `add holiday on ${dateText}`;
}

export function addLocationTranscript(locationName: string): string {
  return `add location ${locationName}`;
}

export function changeCategoryTranscript(categoryName: string): string {
  return `change category to ${categoryName}`;
}

export const NEXT_HOLIDAY_TRANSCRIPT = 'when is the next holiday';
export const SHOW_TEAM_TRANSCRIPT = 'show team employee list';

/** A transcript containing chrono-node-resolvable relative dates — used for VC-FN-07's date-NLU check. */
export function approveLeaveTomorrowTranscript(employeeName: string): string {
  return `approve leave for ${employeeName} tomorrow`;
}

/** The literal, hardcoded holiday name POST /voice/execute always uses for ADD_HOLIDAY (server/routes/voice.routes.js) — never derived from the transcript. */
export const VOICE_GENERATED_HOLIDAY_NAME = 'Voice Generated Holiday';

/** Distinct per call so a test asserting "no holiday was created" isn't defeated by a leftover row from an earlier disposable-record-only-ever-added run. */
export function uniqueVoiceMarker(prefix = 'E2E Voice'): string {
  return `${prefix} ${uniqueSuffix()}`;
}
