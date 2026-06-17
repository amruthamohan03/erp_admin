import { eq, sql } from 'drizzle-orm';
import {
  trackingTemplateMaster,
  licenseTypeMaster,
  type TrackingTemplateMasterInsert,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Tracking template seeds for §2 step 3. Each row pins to a license type
// (FK to license_type_master_t) so issuing an IB license kicks off Import
// Tracking and issuing an Export license kicks off Export Tracking.
//
// milestones_json shapes match the schema's parseMilestones — see
// src/lib/trackingTemplates.ts for the validator. Tighten / reorder per
// project; these are realistic starting points for DRC customs flow.

interface SeedRow {
  templateKey: string;
  name: string;
  description: string;
  /** type_code from license_type_master_t (IB, Export, …). */
  licenseTypeCode: string;
  milestones: Array<{ key: string; label: string; order: number }>;
}

const rows: SeedRow[] = [
  {
    templateKey: 'tracking_import_default',
    name: 'Import Tracking (default)',
    description:
      'Standard Import (IB) tracking flow from arrival at port through release.',
    licenseTypeCode: 'IB',
    milestones: [
      { key: 'arrival',     label: 'Goods arrived at port',     order: 10 },
      { key: 'manifest',    label: 'Manifest filed',             order: 20 },
      { key: 'declaration', label: 'Customs declaration filed', order: 30 },
      { key: 'inspection',  label: 'Goods inspected',            order: 40 },
      { key: 'duties_paid', label: 'Duties + taxes paid',        order: 50 },
      { key: 'released',    label: 'Goods released',              order: 60 },
    ],
  },
  {
    templateKey: 'tracking_export_default',
    name: 'Export Tracking (default)',
    description:
      'Standard Export tracking flow from goods readiness through departure.',
    licenseTypeCode: 'Export',
    milestones: [
      { key: 'goods_ready', label: 'Goods ready for export',     order: 10 },
      { key: 'declaration', label: 'Export declaration filed',   order: 20 },
      { key: 'inspection',  label: 'Goods inspected',             order: 30 },
      { key: 'loaded',      label: 'Goods loaded',                order: 40 },
      { key: 'departed',    label: 'Shipment departed',            order: 50 },
    ],
  },
];

export async function seedTrackingTemplates(
  db: Database | Transaction,
): Promise<void> {
  // Resolve license_type_code → license_type_master_t.id once, then build
  // the insert rows with the FK populated.
  const types = await db
    .select({ id: licenseTypeMaster.id, typeCode: licenseTypeMaster.typeCode })
    .from(licenseTypeMaster);
  const codeToId = new Map<string, number>(
    types.map((t) => [t.typeCode, t.id]),
  );

  const values: TrackingTemplateMasterInsert[] = [];
  for (const r of rows) {
    const licenseTypeId = codeToId.get(r.licenseTypeCode);
    if (!licenseTypeId) {
      throw new Error(
        `seedTrackingTemplates: license_type '${r.licenseTypeCode}' missing — run seedLicenseTypes first`,
      );
    }
    values.push({
      templateKey: r.templateKey,
      name: r.name,
      description: r.description,
      licenseTypeId,
      milestonesJson: r.milestones,
    });
  }

  await db
    .insert(trackingTemplateMaster)
    .values(values)
    .onConflictDoUpdate({
      target: trackingTemplateMaster.templateKey,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        licenseTypeId: sql`excluded.license_type_id`,
        milestonesJson: sql`excluded.milestones_json`,
        updatedAt: sql`now()`,
      },
    });
}
