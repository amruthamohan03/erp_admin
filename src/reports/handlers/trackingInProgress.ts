import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { trackingT, licenseT, clientMaster } from '@/db/schema';
import type { ReportHandler } from '../types';

// Tracking runs currently in_progress, optionally filtered by license
// type. Joins through license_t → client_master_t so operations can see
// "which consignments need attention by client".
//
// Parameters (validated by runReport):
//   license_type_id (optional number) — restrict to runs whose license
//     was issued under this type
//
// Output: tracking_number, license_number, client_name, current_milestone,
// started_at.

export const handler: ReportHandler = async (params) => {
  const licenseTypeId =
    typeof params?.license_type_id === 'number' ? params.license_type_id : null;

  const conditions = [
    eq(trackingT.state, 'in_progress'),
    eq(trackingT.display, 'Y'),
  ];
  if (licenseTypeId != null) {
    conditions.push(eq(licenseT.licenseTypeId, licenseTypeId));
  }

  const rows = await db
    .select({
      tracking_number: trackingT.trackingNumber,
      license_no: licenseT.licenseNo,
      client_name: clientMaster.legalName,
      current_milestone: trackingT.currentMilestoneKey,
      started_at: sql<string | null>`to_char(${trackingT.startedAt}, 'YYYY-MM-DD HH24:MI')`,
    })
    .from(trackingT)
    .innerJoin(licenseT, eq(trackingT.licenseId, licenseT.id))
    .innerJoin(clientMaster, eq(licenseT.clientId, clientMaster.id))
    .where(and(...conditions))
    .orderBy(trackingT.startedAt);

  return rows.map((r) => ({
    tracking_number: r.tracking_number,
    license_no: r.license_no,
    client_name: r.client_name,
    current_milestone: r.current_milestone,
    started_at: r.started_at,
  }));
};
