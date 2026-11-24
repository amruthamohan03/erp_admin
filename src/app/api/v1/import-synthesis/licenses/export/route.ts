import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildXlsx, xlsxResponse, dateStamp, type XlsxColumn } from '@/lib/xlsx';
import { formatDate } from '@/lib/formatDate';
import { NO_VALUE } from '@/lib/displayValue';
import { IMPORT_SYNTHESIS_RESOURCE, synthesisLicenseQuerySchema } from '@/schemas';
import { synthesisFiles, synthesisLicenses, type SynthesisFile, type SynthesisLicense } from '@/db/queries/importSynthesis';

// GET /api/v1/import-synthesis/licenses/export?kind_id=&client_id=
//
// The legacy "TRACKING LICENCES <client> <year>" sheet: one row per file, the
// licence's figures repeated on each, and the licence's FOB drawn down file by
// file. A licence with no file yet still gets its one row.

const MONEY = '#,##0.00';
const text = (v: string | null | undefined): string => v?.trim() || NO_VALUE;
const day = (v: string | null | undefined): string => formatDate(v, '');

const columns: XlsxColumn[] = [
  { key: 'mca_ref', header: 'FILE REF', width: 18 },
  { key: 'supplier', header: 'SUPPLIER', width: 28 },
  { key: 'po_ref', header: 'PO.REF', width: 14 },
  { key: 'license_number', header: 'Num.LICENSE', width: 24 },
  { key: 'ref_cod', header: 'COD', width: 20 },
  { key: 'currency', header: 'CURRENCY', width: 9 },
  { key: 'fob', header: 'FOB_LICENSE', width: 14, numFmt: MONEY },
  { key: 'freight', header: 'FREIGHT_LICENSE', width: 14, numFmt: MONEY },
  { key: 'insurance', header: 'INSURANCE_LICENSE', width: 14, numFmt: MONEY },
  { key: 'other_costs', header: 'OTHER_CHARGE_LICENSE', width: 14, numFmt: MONEY },
  { key: 'cif', header: 'CIF_LICENSE', width: 14, numFmt: MONEY },
  { key: 'fsi', header: 'FSI', width: 14 },
  { key: 'aur', header: 'AUR', width: 14 },
  { key: 'validation_date', header: 'VALIDATION', width: 12 },
  { key: 'expiry_date', header: 'EXTREM_VALID.', width: 12 },
  { key: 'av', header: 'AV', width: 20 },
  { key: 'invoice', header: 'INVOICE', width: 18 },
  { key: 'file_fob', header: 'FOB_FILE', width: 14, numFmt: MONEY },
  { key: 'balance', header: 'BALANCE', width: 14, numFmt: MONEY, bold: true },
  { key: 'remark', header: 'REMARK', width: 22 },
  { key: 'file_freight', header: 'FREIGHT_FILE', width: 14, numFmt: MONEY },
  { key: 'file_insurance', header: 'INSURANCE_FILE', width: 14, numFmt: MONEY },
  { key: 'file_other', header: 'OTHER_CHARGE_FILE', width: 14, numFmt: MONEY },
  { key: 'file_cif', header: 'CIF_FILE', width: 14, numFmt: MONEY },
  { key: 'ref_decl', header: 'DECL.REF.', width: 14 },
  { key: 'date_decl', header: 'DECL.DATE', width: 12 },
  { key: 'ref_liquid', header: 'LIQ.REF.', width: 14 },
  { key: 'date_liquid', header: 'LIQ.DATE', width: 12 },
  { key: 'ref_quit', header: 'QUITT.REF.', width: 14 },
  { key: 'date_quit', header: 'QUITT.DATE', width: 12 },
  { key: 'transmission', header: 'TRANSMISSION', width: 22 },
  { key: 'status', header: 'STATUS', width: 12, align: 'center' },
];

function licenceCells(l: SynthesisLicense): Record<string, unknown> {
  return {
    supplier: text(l.supplier),
    license_number: text(l.license_number),
    ref_cod: text(l.ref_cod),
    currency: text(l.currency),
    fob: l.fob,
    freight: l.freight,
    insurance: l.insurance,
    other_costs: l.other_costs,
    cif: l.cif,
    fsi: text(l.fsi),
    aur: text(l.aur),
    validation_date: day(l.validation_date),
    expiry_date: day(l.expiry_date),
    status: l.status,
  };
}

function fileCells(f: SynthesisFile, balance: number): Record<string, unknown> {
  return {
    mca_ref: text(f.mca_ref),
    po_ref: text(f.po_ref),
    av: text(f.num_av),
    invoice: text(f.invoice),
    file_fob: f.fob,
    balance,
    // ROUND(…,0) < 0 in the legacy sheet: cents of rounding are not an overrun.
    remark: Math.round(balance) < 0 ? 'License Amount Exceeded' : 'OK',
    file_freight: f.freight,
    file_insurance: f.insurance,
    file_other: f.other,
    file_cif: f.fob + f.freight + f.insurance + f.other,
    ref_decl: text(f.ref_decl),
    date_decl: day(f.date_decl),
    ref_liquid: text(f.ref_liquid),
    date_liquid: day(f.date_liquid),
    ref_quit: text(f.ref_quit),
    date_quit: day(f.date_quit),
    transmission: f.transmission_reference ? `${f.transmission_reference} du ${day(f.transmission_date)}` : 'Not transmitted',
  };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(IMPORT_SYNTHESIS_RESOURCE, 'export');
  if (isResponse(session)) return session;
  const q = synthesisLicenseQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));

  const [licences, names] = await Promise.all([
    synthesisLicenses(q.kind_id, q.client_id),
    db.execute(sql`
      SELECT (SELECT short_name FROM client_master_t WHERE id = ${q.client_id}) AS client,
             (SELECT kind_name FROM kind_master_t WHERE id = ${q.kind_id}) AS kind`),
  ]);
  const meta = (names as unknown as { rows: Array<{ client: string | null; kind: string | null }> }).rows[0];
  const client = meta?.client ?? 'CLIENT';
  const kind = meta?.kind ?? 'KIND';

  const files = await synthesisFiles(licences.map((l) => l.id));
  const byLicence = new Map<number, SynthesisFile[]>();
  for (const f of files) byLicence.set(f.license_id, [...(byLicence.get(f.license_id) ?? []), f]);

  const rows: Array<Record<string, unknown>> = [];
  for (const l of licences) {
    const own = byLicence.get(l.id) ?? [];
    if (own.length === 0) {
      rows.push({ ...licenceCells(l), mca_ref: NO_VALUE, balance: l.fob, remark: 'OK' });
      continue;
    }
    let balance = l.fob;
    for (const f of own) {
      balance = Math.round((balance - f.fob) * 100) / 100;
      rows.push({ ...licenceCells(l), ...fileCells(f, balance) });
    }
  }

  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'license',
    entityId: `synthesis:${q.kind_id}:${q.client_id}`,
    module: 'import-synthesis',
    after: { client, kind, licences: licences.length, rows: rows.length },
  });

  const buf = await buildXlsx([
    {
      name: 'Licences',
      title: [`TRACKING LICENCES ${client.toUpperCase()} — ${kind.toUpperCase()} ${new Date().getFullYear()}`],
      columns,
      rows,
      borders: true,
      // §4.38 — the same reading as the status badge: expired or annulled is red.
      rowTone: (r) => (r.status === 'EXPIRED' || r.status === 'ANNULATED' ? 'danger' : null),
    },
  ]);
  const safe = (s: string): string => s.replace(/[^A-Za-z0-9-]+/g, '-');
  const res = xlsxResponse(buf, `${safe(client)}_LICENCE_${safe(kind)}_${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
