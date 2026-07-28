// §2 step 5 — Export invoice Excel exports (Debit Note / Invoice). Ports the
// legacy exportAllDebitNotes / exportAllInvoices: one row per MCA file.
//   DN  = reimbursable view — liquidation (per MCA) + CEEC/CGEA/OCC/LMC/OGEFREM
//         (stored per MCA) + category-2 "other charges" split by weight.
//   INV = category-3 operational + category-4 agency, split evenly per MCA file.
// The heavy per-item breakdown columns of the legacy export are condensed to the
// stored per-MCA duty amounts + category buckets (faithful totals, fewer columns).
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { buildXlsx, type XlsxColumn } from '@/lib/xlsx';

export type ExportProfile = 'dn' | 'inv';

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number): number => Math.round(n * 100) / 100;
const d = (v: unknown): string => {
  if (!v) return '';
  const s = String(v).slice(0, 10);
  const [y, m, day] = s.split('-');
  return y && m && day ? `${day}/${m}/${y}` : s;
};

function formatMcaRange(refs: string[]): string {
  const clean = refs.filter(Boolean);
  if (clean.length <= 1) return clean.join(', ');
  const parsed = clean.map((ref) => {
    const m = /(\d+)(?!.*\d)/.exec(ref);
    return m ? { num: parseInt(m[1], 10), ref } : null;
  });
  if (parsed.some((p) => p === null)) return clean.join(', ');
  const rows = (parsed as { num: number; ref: string }[]).slice().sort((a, b) => a.num - b.num);
  const groups: [typeof rows[0], typeof rows[0]][] = [];
  let start = rows[0];
  let end = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].num === end.num + 1) end = rows[i];
    else {
      groups.push([start, end]);
      start = rows[i];
      end = rows[i];
    }
  }
  groups.push([start, end]);
  return groups.map(([a, b]) => (a.num === b.num ? a.ref : `${a.ref} to ${b.ref}`)).join(', ');
}

const BASE: XlsxColumn[] = [
  { key: 'n', header: '#', width: 5 },
  { key: 'mca_ref', header: 'Notre N° Ref #', width: 18 },
  { key: 'lot_number', header: 'Lot Num.', width: 14 },
  { key: 'license_number', header: 'License Num.', width: 16 },
  { key: 'client', header: 'Client', width: 20 },
  { key: 'encoded_by', header: 'Encoded By', width: 14 },
  { key: 'decl_ref', header: 'Declaration Ref.', width: 16 },
  { key: 'decl_date', header: 'Declaration Date', width: 13 },
  { key: 'liq_ref', header: 'Liquidation Ref.', width: 16 },
  { key: 'liq_date', header: 'Liquidation Date', width: 13 },
  { key: 'quit_ref', header: 'Quittance Ref.', width: 16 },
  { key: 'quit_date', header: 'Quittance Date', width: 13 },
  { key: 'facture', header: 'FACTURE N°', width: 16 },
  { key: 'inv_date', header: 'INV. DATE', width: 12 },
  { key: 'trucks', header: 'Nombre de Trucks', width: 8 },
  { key: 'dossiers', header: 'Dossier(s)', width: 22 },
  { key: 'qty_mt', header: 'Qty(Mt)', width: 10 },
];
const DN_MID: XlsxColumn[] = [
  { key: 'liq_cdf', header: 'LIQ AMT CDF', width: 14 },
  { key: 'rate', header: 'Rate(CDF/USD)', width: 12 },
  { key: 'liq_usd', header: 'LIQ AMT/USD', width: 12 },
  { key: 'ceec', header: 'CEEC', width: 10 },
  { key: 'cgea', header: 'CGEA', width: 10 },
  { key: 'occ', header: 'OCC', width: 10 },
  { key: 'lmc', header: 'LMC', width: 10 },
  { key: 'ogefrem', header: 'OGEFREM', width: 10 },
  { key: 'other_charges', header: 'Other Charges', width: 12 },
  { key: 'other_tva', header: 'TVA/USD', width: 10 },
  { key: 'other_total', header: 'Total', width: 12 },
];
const INV_MID: XlsxColumn[] = [
  { key: 'operational', header: 'Operational Costs', width: 14 },
  { key: 'op_tva', header: 'TVA/USD', width: 10 },
  { key: 'op_total', header: 'Total', width: 12 },
  { key: 'agency', header: 'Agency Fee', width: 12 },
  { key: 'agency_tva', header: 'TVA/USD', width: 10 },
  { key: 'agency_total', header: 'Total', width: 12 },
];
const TAIL: XlsxColumn[] = [
  { key: 'total_invoice', header: 'Total Invoice', width: 14 },
  { key: 'container', header: 'Container', width: 14 },
  { key: 'status', header: 'Status', width: 14 },
  { key: 'dgi_code', header: 'DGI Code', width: 14 },
  { key: 'dgi_amount', header: 'DGI Amount', width: 12 },
  { key: 'normalized_by', header: 'Normalized By', width: 16 },
];

const statusText = (v: number): string => (v === 2 ? 'DGI Verified' : v === 1 ? 'Validated' : 'Not Validated');

export async function buildExportInvoiceExport(
  profile: ExportProfile,
  opts: { dateFrom?: string; dateTo?: string },
): Promise<Buffer> {
  const conds = [sql`inv.display = 'Y'`];
  if (opts.dateFrom) conds.push(sql`inv.invoice_date >= ${opts.dateFrom}`);
  if (opts.dateTo) conds.push(sql`inv.invoice_date <= ${opts.dateTo}`);

  const invRes = await db.execute(sql`
    SELECT inv.id, inv.invoice_ref, inv.invoice_date, inv.validated, inv.dgi_code, inv.dgi_amount,
           c.short_name AS client_name, l.license_number,
           u.username AS encoded_by, un.full_name AS normalizer_name
    FROM export_invoices_t inv
    LEFT JOIN client_master_t c ON c.id = inv.client_id
    LEFT JOIN license_t l ON l.id = inv.license_id
    LEFT JOIN users_t u ON u.id = inv.created_by
    LEFT JOIN users_t un ON un.id = inv.normalized_by
    WHERE ${sql.join(conds, sql` AND `)}
    ORDER BY inv.id DESC`);
  const invoices = (invRes as unknown as { rows: Record<string, unknown>[] }).rows;

  const rows: Record<string, unknown>[] = [];
  let serial = 1;

  for (const inv of invoices) {
    const mcaRes = await db.execute(sql`
      SELECT eimd.*, e.mca_ref
      FROM export_invoice_mca_details_t eimd
      LEFT JOIN exports_t e ON e.id = eimd.mca_id
      WHERE eimd.export_invoice_id = ${inv.id}
      ORDER BY eimd.display_order ASC, eimd.id ASC`);
    const mcas = (mcaRes as unknown as { rows: Record<string, unknown>[] }).rows;
    if (!mcas.length) continue;

    // Category buckets from the saved items.
    const catRes = await db.execute(sql`
      SELECT category_id, COALESCE(SUM(subtotal_usd),0) AS sub, COALESCE(SUM(tva_usd),0) AS tva, COALESCE(SUM(total_usd),0) AS tot
      FROM export_invoice_items_t WHERE export_invoice_id = ${inv.id} GROUP BY category_id`);
    const cat: Record<number, { sub: number; tva: number; tot: number }> = {};
    for (const r of (catRes as unknown as { rows: Record<string, unknown>[] }).rows) {
      cat[num(r.category_id)] = { sub: num(r.sub), tva: num(r.tva), tot: num(r.tot) };
    }
    const other = cat[2] ?? { sub: 0, tva: 0, tot: 0 };
    const op = cat[3] ?? { sub: 0, tva: 0, tot: 0 };
    const agency = cat[4] ?? { sub: 0, tva: 0, tot: 0 };

    const cnt = mcas.length;
    const totalWeight = mcas.reduce((s, m) => s + num(m.weight), 0);
    const dossiers = formatMcaRange(mcas.map((m) => String(m.mca_ref ?? '')));
    const invDate = d(inv.invoice_date);
    const status = statusText(num(inv.validated));

    for (const m of mcas) {
      const weight = num(m.weight);
      const wProp = totalWeight > 0 ? weight / totalWeight : 1 / cnt;
      const rate = num(m.bcc_rate) || 2500;
      const liqCdf = num(m.liquidation_amount);
      const liqUsd = rate > 0 ? r2(liqCdf / rate) : 0;

      const base: Record<string, unknown> = {
        n: serial++,
        mca_ref: m.mca_ref ?? '',
        lot_number: m.lot_number ?? '',
        license_number: inv.license_number ?? '',
        client: inv.client_name ?? '',
        encoded_by: inv.encoded_by ?? '',
        decl_ref: m.declaration_no ?? '',
        decl_date: d(m.declaration_date),
        liq_ref: m.liquidation_no ?? '',
        liq_date: d(m.liquidation_date),
        quit_ref: m.quittance_no ?? '',
        quit_date: d(m.quittance_date),
        facture: (profile === 'dn' ? 'ND-' : '') + String(inv.invoice_ref ?? ''),
        inv_date: invDate,
        trucks: cnt,
        dossiers,
        qty_mt: r2(weight),
      };
      const tail: Record<string, unknown> = {
        container: m.container ?? '',
        status,
        dgi_code: inv.dgi_code ?? '',
        dgi_amount: r2(num(inv.dgi_amount) / cnt),
        normalized_by: inv.normalizer_name ?? '',
      };

      if (profile === 'dn') {
        const otherTotalPer = r2(other.tot * wProp);
        rows.push({
          ...base,
          liq_cdf: r2(liqCdf),
          rate: r2(rate),
          liq_usd: liqUsd,
          ceec: r2(num(m.ceec_amount)),
          cgea: r2(num(m.cgea_amount)),
          occ: r2(num(m.occ_amount)),
          lmc: r2(num(m.lmc_amount)),
          ogefrem: r2(num(m.ogefrem_amount)),
          other_charges: r2(other.sub * wProp),
          other_tva: r2(other.tva * wProp),
          other_total: otherTotalPer,
          total_invoice: r2(liqUsd + otherTotalPer),
          ...tail,
        });
      } else {
        const opTotalPer = r2(op.tot / cnt);
        const agencyTotalPer = r2(agency.tot / cnt);
        rows.push({
          ...base,
          operational: r2(op.sub / cnt),
          op_tva: r2(op.tva / cnt),
          op_total: opTotalPer,
          agency: r2(agency.sub / cnt),
          agency_tva: r2(agency.tva / cnt),
          agency_total: agencyTotalPer,
          total_invoice: r2(opTotalPer + agencyTotalPer),
          ...tail,
        });
      }
    }
  }

  const columns = [...BASE, ...(profile === 'dn' ? DN_MID : INV_MID), ...TAIL];
  const title = profile === 'dn' ? 'Debit Notes' : 'Invoices';
  return buildXlsx([{ name: title, columns, rows }]);
}
