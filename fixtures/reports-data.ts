import { uniqueSuffix } from './test-data';

/** Collision-safe saved-filter name — see fixtures/test-data.ts's uniqueSuffix() doc comment for why a bare Date.now() isn't safe across parallel workers. */
export function uniqueSavedFilterName(prefix = 'E2E Filter'): string {
  return `${prefix} ${uniqueSuffix()}`;
}
