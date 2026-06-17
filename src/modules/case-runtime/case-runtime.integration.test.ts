import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { getTestDb, startTestDb } from '@/test/dbHarness';
import {
  clientMaster,
  licenseTypeMaster,
  licenseT,
  notificationOutbox,
} from '@/db/schema';
import {
  createCase,
  readCase,
  advanceCase,
} from '@/modules/case-runtime';
import { ForbiddenError } from '@/lib/errors';

// First integration test against the real DB harness. Exercises the
// license_default template seeded by seedMasters() during globalSetup:
//   * createCase honours form validation + writes the entity row
//   * readCase returns the entity + available transitions
//   * advanceCase persists state transitions + records audit cols
//   * The no_self_approve rule gate fires on self-approval
//
// Each test inserts its own license + client rows and TRUNCATEs them
// in beforeEach so suites can run in any order without cross-test leakage.
//
// Skipping rather than failing keeps unit-only contributors unblocked.

const harness = await (async () => {
  try {
    return await startTestDb();
  } catch (err) {
    console.warn('[integration] Skipping — DB harness unavailable:', err);
    return null;
  }
})();

const skipIfNoHarness = harness == null ? it.skip : it;

describe('case-runtime integration (license_default)', () => {
  if (harness == null) {
    it.skip('skipped — no test DB available', () => {});
    return;
  }

  let clientId: number;
  let licenseTypeId: number;

  beforeAll(async () => {
    const h = getTestDb();
    // Pick up an existing license_type seeded by seedMasters.
    const [type] = await h.db
      .select()
      .from(licenseTypeMaster)
      .where(eq(licenseTypeMaster.typeCode, 'IB'))
      .limit(1);
    licenseTypeId = type!.id;
  });

  beforeEach(async () => {
    const h = getTestDb();
    // Reset entity tables we touch. Order matters for FKs.
    await h.db.execute(sql`TRUNCATE TABLE ${notificationOutbox} RESTART IDENTITY CASCADE`);
    await h.db.execute(sql`TRUNCATE TABLE ${licenseT} RESTART IDENTITY CASCADE`);
    await h.db.execute(sql`TRUNCATE TABLE ${clientMaster} RESTART IDENTITY CASCADE`);
    const [c] = await h.db
      .insert(clientMaster)
      .values({ clientCode: 'CLI-TEST', name: 'Test client' })
      .returning({ id: clientMaster.id });
    clientId = c!.id;
  });

  afterAll(async () => {
    // Don't tear down the container here — globalSetup owns its lifecycle.
  });

  skipIfNoHarness('createCase validates input and inserts a license row', async () => {
    const result = await createCase({
      templateKey: 'license_default',
      actorUserId: 1,
      values: {
        license_no: 'IB-TEST-001',
        client_id: clientId,
        license_type_id: licenseTypeId,
        amount: 1500,
        currency: 'USD',
      },
    });
    expect(result.caseId).toBeGreaterThan(0);
    expect(result.state).toBe('draft');

    const read = await readCase({
      templateKey: 'license_default',
      caseId: result.caseId,
    });
    expect(read.entity.license_no).toBe('IB-TEST-001');
    expect(read.state).toBe('draft');
    // submit should be the one transition from draft.
    expect(read.availableTransitions.map((t) => t.transitionKey)).toContain(
      'submit',
    );
  });

  skipIfNoHarness('advanceCase moves state and surfaces follow-on transitions', async () => {
    const { caseId } = await createCase({
      templateKey: 'license_default',
      actorUserId: 1,
      values: {
        license_no: 'IB-TEST-002',
        client_id: clientId,
        license_type_id: licenseTypeId,
        amount: 2500,
        currency: 'USD',
      },
    });

    const r = await advanceCase({
      templateKey: 'license_default',
      caseId,
      transitionKey: 'submit',
      actorUserId: 1,
      actorRoleId: 1,
    });
    expect(r.previousState).toBe('draft');
    expect(r.newState).toBe('submitted');

    const after = await readCase({ templateKey: 'license_default', caseId });
    expect(after.state).toBe('submitted');
    expect(after.availableTransitions.map((t) => t.transitionKey).sort()).toEqual(
      ['approve', 'cancel_from_submitted', 'reject'].sort(),
    );
  });

  skipIfNoHarness('no_self_approve denies the creator from approving', async () => {
    const { caseId } = await createCase({
      templateKey: 'license_default',
      actorUserId: 1,
      values: {
        license_no: 'IB-TEST-003',
        client_id: clientId,
        license_type_id: licenseTypeId,
        amount: 5000,
        currency: 'USD',
      },
    });
    await advanceCase({
      templateKey: 'license_default',
      caseId,
      transitionKey: 'submit',
      actorUserId: 1,
      actorRoleId: 1,
    });
    // The license was created by user 1; approving as user 1 hits the
    // no_self_approve gate. ForbiddenError.
    await expect(
      advanceCase({
        templateKey: 'license_default',
        caseId,
        transitionKey: 'approve',
        actorUserId: 1,
        actorRoleId: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // A different user (actorUserId=2) is allowed.
    const ok = await advanceCase({
      templateKey: 'license_default',
      caseId,
      transitionKey: 'approve',
      actorUserId: 2,
      actorRoleId: 1,
    });
    expect(ok.newState).toBe('approved');
  });
});
