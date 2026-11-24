// Import Synthesis queries (§7.4) — Import License → Import Synthesis, ported
// from the legacy IsController ("Synthèse Licences").
//
// One card per active kind (kind_master_t, §4.1 — the legacy page hardcoded
// four groups of kind ids), then one client's licences of that kind with what
// their files have used, what is left, and how far their apurement has got.
//
// "Used" counts the licence's live import files — not deleted, not cancelled —
// the same set Import Apurement and the licence balances elsewhere count.
// Apurement comes from import_apurement_t: a file is apured once a live
// transmission carries it.
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fileNotCancelled } from '@/db/queries/fileCancellation';
import { EFFECTIVE_STATUS } from '@/db/queries/licenseFilters';

async function rows<T>(query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return (result as unknown as { rows: T[] }).rows;
}

const date = (col: SQL): SQL => sql`to_char(${col}, 'YYYY-MM-DD')`;
const money = (col: SQL): SQL => sql`COALESCE(${col}, 0)::float`;

/** `i` = imports_t — a file that draws on its licence. */
const LIVE_FILE = sql`i.display = 'Y' AND ${fileNotCancelled(sql`i.clearing_status`)}`;

/** A file is apured once a live transmission carries it. */
const APURED = sql`EXISTS (
  SELECT 1 FROM import_apurement_t a
  JOIN import_transmission_t t ON t.id = a.transmission_id AND t.display = 'Y'
  WHERE a.import_id = i.id)`;

// ---- Cards and client breakdown --------------------------------------------------

export interface SynthesisKind {
  kind_id: number;
  kind_name: string;
  kind_short_name: string;
  license_count: number;
}

/** Every active kind, with its live-licence count — kinds without licences included. */
export async function synthesisKinds(): Promise<SynthesisKind[]> {
  return rows<SynthesisKind>(sql`
    SELECT k.id AS kind_id, k.kind_name, k.kind_short_name,
           (SELECT COUNT(*) FROM license_t l WHERE l.kind_id = k.id AND l.display = 'Y')::int AS license_count
    FROM kind_master_t k
    WHERE k.display = 'Y'
    ORDER BY k.id`);
}

export interface SynthesisClient {
  client_id: number;
  short_name: string | null;
  company_name: string | null;
  license_count: number;
}

/** Clients holding licences of one kind, most licences first. */
export async function synthesisClients(kindId: number): Promise<SynthesisClient[]> {
  return rows<SynthesisClient>(sql`
    SELECT c.id AS client_id, c.short_name, c.company_name, COUNT(*)::int AS license_count
    FROM license_t l
    JOIN client_master_t c ON c.id = l.client_id
    WHERE l.kind_id = ${kindId} AND l.display = 'Y'
    GROUP BY c.id, c.short_name, c.company_name
    ORDER BY license_count DESC, c.id`);
}

// ---- The synthesis table ---------------------------------------------------------

export type ApurementState = 'none' | 'not' | 'partial' | 'apured';

export interface SynthesisLicense {
  id: number;
  license_number: string | null;
  ref_cod: string | null;
  status: string;
  client_short: string | null;
  kind_name: string | null;
  applied_date: string | null;
  validation_date: string | null;
  expiry_date: string | null;
  supplier: string | null;
  goods_type: string | null;
  currency: string | null;
  bank: string | null;
  fsi: string | null;
  aur: string | null;
  license_file: string | null;
  fob: number;
  insurance: number;
  freight: number;
  other_costs: number;
  cif: number;
  weight: number;
  files: number;
  used_fob: number;
  used_insurance: number;
  used_freight: number;
  used_other: number;
  used_weight: number;
  apured_files: number;
  // Derived in TypeScript from the columns above — see withBalances.
  fob_balance: number;
  insurance_balance: number;
  freight_balance: number;
  other_balance: number;
  cif_balance: number;
  weight_balance: number;
  apurement: ApurementState;
}

type LicenseBase = Omit<
  SynthesisLicense,
  'fob_balance' | 'insurance_balance' | 'freight_balance' | 'other_balance' | 'cif_balance' | 'weight_balance' | 'apurement'
>;

const round = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Balances are NOT clamped at zero. The legacy page showed GREATEST(0, …), which
 * made an over-consumed licence look exactly like a fully used one — the one
 * case an operator most needs to see. A negative balance is shown, in red.
 */
function withBalances(r: LicenseBase): SynthesisLicense {
  const fobBal = round(r.fob - r.used_fob);
  const insBal = round(r.insurance - r.used_insurance);
  const frtBal = round(r.freight - r.used_freight);
  const othBal = round(r.other_costs - r.used_other);
  return {
    ...r,
    fob_balance: fobBal,
    insurance_balance: insBal,
    freight_balance: frtBal,
    other_balance: othBal,
    cif_balance: round(fobBal + insBal + frtBal + othBal),
    weight_balance: round(r.weight - r.used_weight),
    apurement: r.files === 0 ? 'none' : r.apured_files === 0 ? 'not' : r.apured_files < r.files ? 'partial' : 'apured',
  };
}

const LICENSE_SELECT = sql`
  SELECT license_t.id, license_t.license_number, license_t.ref_cod,
         ${EFFECTIVE_STATUS} AS status,
         c.short_name AS client_short, k.kind_name,
         ${date(sql`license_t.license_applied_date`)} AS applied_date,
         ${date(sql`license_t.license_validation_date`)} AS validation_date,
         ${date(sql`license_t.license_expiry_date`)} AS expiry_date,
         license_t.supplier, g.goods_type,
         cur.currency_short_name AS currency, b.bank_name AS bank,
         license_t.fsi, license_t.aur, license_t.license_file,
         ${money(sql`license_t.fob_declared`)} AS fob,
         ${money(sql`license_t.insurance`)} AS insurance,
         ${money(sql`license_t.freight`)} AS freight,
         ${money(sql`license_t.other_costs`)} AS other_costs,
         (COALESCE(license_t.fob_declared, 0) + COALESCE(license_t.insurance, 0)
          + COALESCE(license_t.freight, 0) + COALESCE(license_t.other_costs, 0))::float AS cif,
         ${money(sql`license_t.weight`)} AS weight,
         COALESCE(u.files, 0)::int AS files,
         COALESCE(u.fob, 0)::float AS used_fob,
         COALESCE(u.insurance, 0)::float AS used_insurance,
         COALESCE(u.freight, 0)::float AS used_freight,
         COALESCE(u.other, 0)::float AS used_other,
         COALESCE(u.weight, 0)::float AS used_weight,
         COALESCE(u.apured, 0)::int AS apured_files
  FROM license_t
  LEFT JOIN client_master_t c ON c.id = license_t.client_id
  LEFT JOIN kind_master_t k ON k.id = license_t.kind_id
  LEFT JOIN type_of_goods_master_t g ON g.id = license_t.type_of_goods_id
  LEFT JOIN currency_master_t cur ON cur.id = license_t.currency_id
  LEFT JOIN banklist_master_t b ON b.id = license_t.bank_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS files, SUM(i.fob) AS fob, SUM(i.insurance_amount) AS insurance,
           SUM(i.fret) AS freight, SUM(i.other_charges) AS other, SUM(i.weight) AS weight,
           COUNT(*) FILTER (WHERE ${APURED}) AS apured
    FROM imports_t i
    WHERE i.license_id = license_t.id AND ${LIVE_FILE}
  ) u ON true`;

export async function synthesisLicenses(kindId: number, clientId: number): Promise<SynthesisLicense[]> {
  const list = await rows<LicenseBase>(sql`
    ${LICENSE_SELECT}
    WHERE license_t.kind_id = ${kindId} AND license_t.client_id = ${clientId} AND license_t.display = 'Y'
    ORDER BY license_t.license_validation_date DESC NULLS LAST, license_t.id DESC`);
  return list.map(withBalances);
}

export async function synthesisLicense(id: number): Promise<SynthesisLicense | null> {
  const [row] = await rows<LicenseBase>(sql`${LICENSE_SELECT} WHERE license_t.id = ${id} AND license_t.display = 'Y'`);
  return row ? withBalances(row) : null;
}

// ---- One licence's files (the detail view and the export) ------------------------

export interface SynthesisFile {
  import_id: number;
  license_id: number;
  mca_ref: string | null;
  po_ref: string | null;
  invoice: string | null;
  num_av: string | null;
  montant_av: number;
  fob: number;
  freight: number;
  insurance: number;
  other: number;
  weight: number;
  ref_decl: string | null;
  date_decl: string | null;
  ref_liquid: string | null;
  date_liquid: string | null;
  ref_quit: string | null;
  date_quit: string | null;
  transmission_reference: string | null;
  transmission_date: string | null;
}

export async function synthesisFiles(licenseIds: number[]): Promise<SynthesisFile[]> {
  if (licenseIds.length === 0) return [];
  return rows<SynthesisFile>(sql`
    SELECT i.id AS import_id, i.license_id, i.mca_ref, i.po_ref, i.invoice,
           (SELECT p.partial_name FROM partial_t p WHERE p.partial_name = i.inspection_reports AND p.display = 'Y' LIMIT 1) AS num_av,
           COALESCE((SELECT p.partial_fob FROM partial_t p WHERE p.partial_name = i.inspection_reports AND p.display = 'Y' LIMIT 1), 0)::float AS montant_av,
           ${money(sql`i.fob`)} AS fob, ${money(sql`i.fret`)} AS freight,
           ${money(sql`i.insurance_amount`)} AS insurance, ${money(sql`i.other_charges`)} AS other,
           ${money(sql`i.weight`)} AS weight,
           i.declaration_reference AS ref_decl, ${date(sql`i.dgda_in_date`)} AS date_decl,
           i.liquidation_reference AS ref_liquid, ${date(sql`i.liquidation_date`)} AS date_liquid,
           i.quittance_reference AS ref_quit, ${date(sql`i.quittance_date`)} AS date_quit,
           t.transmission_reference, ${date(sql`t.transmission_date`)} AS transmission_date
    FROM imports_t i
    LEFT JOIN import_apurement_t a ON a.import_id = i.id
    LEFT JOIN import_transmission_t t ON t.id = a.transmission_id AND t.display = 'Y'
    WHERE i.license_id IN (${sql.join(licenseIds.map((id) => sql`${id}`), sql`, `)}) AND ${LIVE_FILE}
    ORDER BY i.license_id, i.id`);
}

export interface SynthesisFileSummary {
  files: number;
  fob: number;
  weight: number;
  transmitted: number;
  transmitted_fob: number;
  /** Licence FOB less the FOB of the files already sent to the bank. */
  fob_not_transmitted: number;
}

export function summariseFiles(licenseFob: number, files: SynthesisFile[]): SynthesisFileSummary {
  const sent = files.filter((f) => f.transmission_reference);
  const transmittedFob = sent.reduce((s, f) => s + f.fob, 0);
  return {
    files: files.length,
    fob: round(files.reduce((s, f) => s + f.fob, 0)),
    weight: round(files.reduce((s, f) => s + f.weight, 0)),
    transmitted: sent.length,
    transmitted_fob: round(transmittedFob),
    fob_not_transmitted: round(licenseFob - transmittedFob),
  };
}
