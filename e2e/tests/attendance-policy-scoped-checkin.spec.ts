import { test, expect } from '../fixtures/auth';
import { readPersonaUser } from '../fixtures/personas';
import { uniqueSuffix } from '../fixtures/test-data';
import { AttendanceCard } from '../pages/AttendanceCard';
import { AttendancePage } from '../pages/AttendancePage';

/**
 * These tests temporarily reassign employeeSelf's attendance policy â€” a
 * genuinely shared, mutable per-user resource â€” to exercise method
 * restriction and geofence rejection deterministically, then restore the
 * original assignment in a `finally` block. Same temporary-add-then-restore
 * shape as helpers/leave.ts's withTemporaryLeaveType() and
 * attendance-rules-settings.spec.ts's own settings mutations.
 *
 * Kept in their own file/describe.serial() block so it only protects ITS OWN
 * tests from interleaving with each other. Per attendance-rules-settings.spec.ts's
 * own documented caveat, true isolation from OTHER spec files running
 * concurrently (fullyParallel: true) is not guaranteed by this alone â€” the
 * temporary policy always keeps 'Manual' allowed specifically so a
 * same-moment overlap with attendance-checkin-checkout.spec.ts's full-cycle
 * smoke test still succeeds; only that file's ATE-PS-01/02/03 dialog-only
 * assertions (which check WFH/ClientVisit/FieldWork button presence) carry a
 * narrow, accepted race window while this block's policy swap is active.
 */
test.describe.serial('Attendance â€” temporary policy reassignment (method restriction / geofence)', () => {
  test('ATE-NG-03 / AT-NG-01 / ATE-PS-08: a policy with a method subset hides the disallowed methods\' buttons entirely; the allowed one still renders', { tag: ['@regression'] }, async ({ adminPage, employeeSelfPage }) => {
    const card = new AttendanceCard(employeeSelfPage);
    const attendance = new AttendancePage(employeeSelfPage);
    const employeeSelf = readPersonaUser('employeeSelf');
    test.skip(!employeeSelf, 'employeeSelf persona not configured â€” see e2e/.env.e2e.example.');

    await attendance.goto();
    test.skip(await card.isAlreadyCheckedInToday(), 'employeeSelf already checked in today â€” the not-recorded view (where method buttons render) is not shown.');

    const originalPolicyResp = await employeeSelfPage.request.get('/api/attendance/my-policy');
    const originalPolicyId = (await originalPolicyResp.json()).policy?.id ?? null;

    const createResp = await adminPage.request.post('/api/attendance-policies', {
      data: {
        name: `E2E Temp Method-Subset Policy ${uniqueSuffix()}`,
        policy_type: 'Hybrid',
        allowed_methods: ['Manual', 'WFH'],
      },
    });
    test.skip(createResp.status() !== 200, 'admin persona does not hold attendance.policy.manage in this tenant.');
    const tempPolicyId = (await createResp.json()).id;

    try {
      const assignResp = await adminPage.request.put(`/api/attendance-policies/assign/${employeeSelf!.id}`, { data: { policyId: tempPolicyId } });
      expect(assignResp.status()).toBe(200);

      await employeeSelfPage.reload();
      await expect(card.manualCheckInButton).toBeVisible();
      await expect(card.workModeButton('WFH')).toBeVisible();
      // ClientVisit/FieldWork are absent from the policy's allowed_methods â€”
      // the button must not render at all, not merely be disabled.
      await expect(card.workModeButton('ClientVisit')).toHaveCount(0);
      await expect(card.workModeButton('FieldWork')).toHaveCount(0);
    } finally {
      await adminPage.request.put(`/api/attendance-policies/assign/${employeeSelf!.id}`, { data: { policyId: originalPolicyId } });
    }
  });

  test('ATE-NG-04 / ATE-PS-09 / AT-NG-02 / AT-FN-10: with no policy assigned, only the Manual button renders', { tag: ['@regression'] }, async ({ adminPage, employeeSelfPage }) => {
    const card = new AttendanceCard(employeeSelfPage);
    const attendance = new AttendancePage(employeeSelfPage);
    const employeeSelf = readPersonaUser('employeeSelf');
    test.skip(!employeeSelf, 'employeeSelf persona not configured â€” see e2e/.env.e2e.example.');

    await attendance.goto();
    test.skip(await card.isAlreadyCheckedInToday(), 'employeeSelf already checked in today â€” the not-recorded view (where method buttons render) is not shown.');

    const originalPolicyResp = await employeeSelfPage.request.get('/api/attendance/my-policy');
    const originalPolicyId = (await originalPolicyResp.json()).policy?.id ?? null;

    const clearResp = await adminPage.request.put(`/api/attendance-policies/assign/${employeeSelf!.id}`, { data: { policyId: null } });
    test.skip(clearResp.status() !== 200, 'admin persona does not hold attendance.policy.manage in this tenant.');

    try {
      await employeeSelfPage.reload();
      await expect(card.manualCheckInButton).toBeVisible();
      await expect(card.workModeButton('WFH')).toHaveCount(0);
      await expect(card.workModeButton('ClientVisit')).toHaveCount(0);
      await expect(card.workModeButton('FieldWork')).toHaveCount(0);

      // AT-NG-02: the UI offers no way to submit a non-Manual method at all
      // once unassigned â€” confirming the 403 the server would return is
      // genuinely unreachable through this screen.
      const myPolicyResp = await employeeSelfPage.request.get('/api/attendance/my-policy');
      expect(await myPolicyResp.json()).toMatchObject({ policy: null, allowedMethods: ['Manual'] });
    } finally {
      await adminPage.request.put(`/api/attendance-policies/assign/${employeeSelf!.id}`, { data: { policyId: originalPolicyId } });
    }
  });

  test('AT-NG-06: checking in via a geofenced work mode from outside the configured radius is rejected', { tag: ['@regression'] }, async ({ adminPage, employeeSelfPage }) => {
    const employeeSelf = readPersonaUser('employeeSelf');
    test.skip(!employeeSelf, 'employeeSelf persona not configured â€” see e2e/.env.e2e.example.');

    const originalPolicyResp = await employeeSelfPage.request.get('/api/attendance/my-policy');
    const originalPolicyId = (await originalPolicyResp.json()).policy?.id ?? null;

    const createResp = await adminPage.request.post('/api/attendance-policies', {
      data: {
        name: `E2E Temp Geofence Policy ${uniqueSuffix()}`,
        policy_type: 'Hybrid',
        allowed_methods: ['Manual', 'WFH'],
        // Bengaluru city-center coordinates, 100m radius.
        config: { geofence_center_lat: 12.9716, geofence_center_lng: 77.5946, geofence_radius_meters: 100 },
      },
    });
    test.skip(createResp.status() !== 200, 'admin persona does not hold attendance.policy.manage in this tenant.');
    const tempPolicyId = (await createResp.json()).id;

    try {
      const assignResp = await adminPage.request.put(`/api/attendance-policies/assign/${employeeSelf!.id}`, { data: { policyId: tempPolicyId } });
      expect(assignResp.status()).toBe(200);

      // The geofence check runs before the one-check-in-per-day duplicate
      // check (attendanceEngine.service.js's recordCheckIn order), so this
      // 400 is reached â€” and this request rejected, no row ever created â€”
      // regardless of whether employeeSelf already has a row today.
      const today = new Date().toISOString().slice(0, 10);
      const response = await employeeSelfPage.request.post('/api/attendance/work-mode/select', {
        data: {
          date: today,
          workMode: 'WFH',
          // New Delhi â€” genuinely ~1,700km from the configured Bengaluru center, well outside 100m.
          location: { lat: 28.6139, lng: 77.209 },
        },
      });
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('You are outside the allowed location range for this attendance method.');
    } finally {
      await adminPage.request.put(`/api/attendance-policies/assign/${employeeSelf!.id}`, { data: { policyId: originalPolicyId } });
    }
  });

  // Not a conditional per-test skip: see shifts.spec.ts's equivalent comment
  // on why this uses the 2-arg test.skip(title, callback) form.
});
