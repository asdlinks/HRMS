import { test, expect } from '../fixtures/auth';
import { ReportsWorkspacePage } from '../pages/ReportsWorkspacePage';
import { ReportPanel } from '../pages/ReportPanel';
import { ReportsFavoritesPage } from '../pages/ReportsFavoritesPage';
import { ReportsSavedPage } from '../pages/ReportsSavedPage';
import {
  getFavoritesApi, addFavoriteApi, removeFavoriteApi,
  getSavedFiltersApi, saveFilterApi, deleteSavedFilterApi,
} from '../helpers/reports';
import { uniqueSavedFilterName } from '../fixtures/reports-data';

/**
 * docs/ReportsEngine_TestCases.csv — Favorites / Saved Filters rows.
 * Automates: RP-FN-08, RP-FN-09, RP-FN-10, RP-FN-11, RP-NG-05, RP-NG-06,
 * RP-AP-05, RP-PM-05, RP-VD-02, RP-UI-05.
 */
test.describe('Reports Engine — Favorites & Saved Filters', () => {
  test('RP-FN-08 / RP-FN-09: favoriting then un-favoriting a report round-trips through GET/POST/DELETE /reports/favorites', { tag: ['@smoke'] }, async ({ adminPage }) => {
    // Self-healing start state: `admin`'s favorites are a real, persistent,
    // shared-persona preference list this suite doesn't otherwise clean up
    // between runs (see RP-UI-05's own note on why favorites/saved-filters
    // are the one exception to the framework's usual no-cleanup convention).
    // removeFavoriteApi on an already-absent id is a harmless no-op
    // (reportPreferences.repository.js's DELETE matches 0 rows silently), so
    // this makes the test correct regardless of what an earlier run left behind.
    await removeFavoriteApi(adminPage, 'leave-summary');
    const before = await getFavoritesApi(adminPage);
    expect(before).not.toContain('leave-summary');

    const addResponse = await addFavoriteApi(adminPage, 'leave-summary');
    expect(addResponse.ok()).toBe(true);
    const afterAdd = await getFavoritesApi(adminPage);
    expect(afterAdd).toContain('leave-summary');

    const removeResponse = await removeFavoriteApi(adminPage, 'leave-summary');
    expect(removeResponse.ok()).toBe(true);
    const afterRemove = await getFavoritesApi(adminPage);
    expect(afterRemove).not.toContain('leave-summary');
  });

  test('RP-FN-10 / RP-FN-11: saving a named filter set then deleting it round-trips through GET/POST/DELETE /reports/saved-filters', { tag: ['@smoke'] }, async ({ adminPage }) => {
    const name = uniqueSavedFilterName();
    const createResponse = await saveFilterApi(adminPage, { reportId: 'employee-master', name, filters: { departmentId: '1', status: 'active' } });
    expect(createResponse.ok()).toBe(true);
    const { id } = await createResponse.json();

    const saved = await getSavedFiltersApi(adminPage, 'employee-master');
    const row = saved.find((s) => s.id === id);
    expect(row?.name).toBe(name);
    expect(row?.filters).toEqual({ departmentId: '1', status: 'active' });

    const deleteResponse = await deleteSavedFilterApi(adminPage, id);
    expect(deleteResponse.ok()).toBe(true);
    const afterDelete = await getSavedFiltersApi(adminPage, 'employee-master');
    expect(afterDelete.find((s) => s.id === id)).toBeUndefined();
  });

  test('RP-NG-05 (confirmed gap) / RP-AP-05 / RP-PM-05: POST /reports/favorites/:reportId succeeds for an arbitrary, nonexistent reportId — no registry validation', { tag: ['@regression'] }, async ({ adminPage }) => {
    const response = await addFavoriteApi(adminPage, 'not-a-real-report-id-xyz');
    expect(response.status()).toBe(201);
    const favorites = await getFavoritesApi(adminPage);
    expect(favorites).toContain('not-a-real-report-id-xyz');
    await removeFavoriteApi(adminPage, 'not-a-real-report-id-xyz'); // cleanup — this one's cheap and harmless to reverse, unlike the framework's usual no-cleanup convention for disposable named records
  });

  test('RP-NG-06 (confirmed gap) / RP-PM-05: POST /reports/saved-filters succeeds for a reportId the caller has no visibility into — no cross-check against the caller\'s own scope', { tag: ['@regression'] }, async ({ employeeSelfPage }) => {
    // employeeSelf holds no reports.organization.view — org-branch-summary is
    // outside their visible catalog entirely, yet saving a filter against it
    // is accepted with no server-side check.
    const name = uniqueSavedFilterName('RP-NG-06');
    const response = await saveFilterApi(employeeSelfPage, { reportId: 'org-branch-summary', name, filters: {} });
    expect(response.status()).toBe(201);
    const { id } = await response.json();
    const saved = await getSavedFiltersApi(employeeSelfPage, 'org-branch-summary');
    expect(saved.some((s) => s.id === id)).toBe(true);
    await deleteSavedFilterApi(employeeSelfPage, id);
  });

  test('RP-VD-02 (confirmed gap): POST /reports/saved-filters only checks reportId && name for truthiness — the filters object itself is stored as opaque, unvalidated JSON', { tag: ['@regression'] }, async ({ adminPage }) => {
    const name = uniqueSavedFilterName('RP-VD-02');
    // A filters shape with no relationship to any real filter key, plus a
    // nested structure — accepted verbatim, proving zero shape validation.
    const weirdFilters = { totallyMadeUpKey: { nested: [1, 2, 3] }, anotherOne: null };
    const response = await saveFilterApi(adminPage, { reportId: 'employee-master', name, filters: weirdFilters });
    expect(response.status()).toBe(201);
    const { id } = await response.json();
    const saved = await getSavedFiltersApi(adminPage, 'employee-master');
    expect(saved.find((s) => s.id === id)?.filters).toEqual(weirdFilters);
    await deleteSavedFilterApi(adminPage, id);
  });

  test('RP-UI-05: the Favorites/Saved Filters pages surface exactly what the unguarded backend routes return, with no extra client-side filtering', { tag: ['@sanity'] }, async ({ adminPage }) => {
    // Deliberately a DIFFERENT report id than RP-FN-08/09's ('leave-summary')
    // — playwright.config.ts runs fullyParallel:true, so these two tests can
    // execute concurrently in separate workers against the SAME underlying
    // `admin` persona/DB rows; sharing one report id here would race on the
    // same report_favorites row. Self-healing start state — see RP-FN-08/09's
    // identical note: without this, a leftover `leave-balance` favorite from
    // an earlier run would make this toggleFavorite() call REMOVE it instead
    // of adding it.
    await removeFavoriteApi(adminPage, 'leave-balance');
    const workspace = new ReportsWorkspacePage(adminPage);
    await workspace.goto('leave', '?report=leave-balance');
    const panel = new ReportPanel(adminPage);
    await panel.toggleFavorite();
    try {
      const favoritesPage = new ReportsFavoritesPage(adminPage);
      await favoritesPage.goto();
      await favoritesPage.expectLoaded();
      await expect(favoritesPage.reportRow('Leave Balance')).toBeVisible();
    } finally {
      // Unlike a uniquely-named disposable record (safe to leave forever per
      // FRAMEWORK_GUIDELINES.md's Cleanup strategy), a favorite/saved-filter
      // is a preference row permanently attached to the SAME reused `admin`
      // persona across every future run — restored in a finally block so a
      // mid-test assertion failure can't leave it dirty for next time.
      await workspace.goto('leave', '?report=leave-balance');
      await panel.toggleFavorite();
    }

    const filterName = uniqueSavedFilterName('RP-UI-05');
    await workspace.goto('leave', '?report=leave-balance');
    await panel.saveFilterAs(filterName);
    try {
      const savedPage = new ReportsSavedPage(adminPage);
      await savedPage.goto();
      await savedPage.expectLoaded();
      await expect(savedPage.savedRow(filterName)).toBeVisible();
    } finally {
      const saved = await getSavedFiltersApi(adminPage, 'leave-balance');
      const created = saved.find((s) => s.name === filterName);
      if (created) await deleteSavedFilterApi(adminPage, created.id);
    }
  });
});
