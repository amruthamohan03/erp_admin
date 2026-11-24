// Import Apurement spreadsheets — the pending files, the apured files, the
// transmissions list, and the transmission sheet sent to the bank. One column
// set per kind of row, so the same file reads the same in every download.
//
// Cells people read follow the house rules: dates DD-MM-YYYY (§4.19), empty
// text N/A (§4.41), amounts as numbers so the columns can still be summed.
import { formatDate } from '@/lib/formatDate';
import { NO_VALUE } from '@/lib/displayValue';
import { type XlsxColumn, type XlsxSheet } from '@/lib/xlsx';
import { loadBranding } from '@/db/queries/branding';
import type { ApuredFileRow, ApurementFileRow, TransmissionRow } from '@/db/queries/importApurement';
import { effectiveAssRef } from '@/modules/import-apurement/assRef';

const MONEY = '#,##0.00';

const text = (v: string | null | undefined): string => v?.trim() || NO_VALUE;
const day = (v: string | null | undefined): string => formatDate(v, '');

const FILE_COLUMNS: XlsxColumn[] = [
  { key: 'client', header: 'CLIENT', width: 10 },
  { key: 'license_number', header: 'NUM LICENCE', width: 22 },
  { key: 'mca_ref', header: 'FILE REF', width: 20 },
  { key: 'fob', header: 'FOB', width: 13, numFmt: MONEY },
  { key: 'fret', header: 'FRET', width: 12, numFmt: MONEY },
  { key: 'assurance', header: 'ASSURANCE', width: 12, numFmt: MONEY },
  { key: 'autres_frets', header: 'AUTRES FRETS', width: 13, numFmt: MONEY },
  { key: 'cif', header: 'CIF', width: 14, numFmt: MONEY },
  { key: 'ref_decl', header: 'REF DECL', width: 16 },
  { key: 'date_decl', header: 'DATE DECL', width: 12 },
  { key: 'ref_liquid', header: 'REF LIQUID', width: 16 },
  { key: 'date_liquid', header: 'DATE LIQUID', width: 12 },
  { key: 'ref_quit', header: 'REF QUIT', width: 16 },
  { key: 'date_quit', header: 'DATE QUIT', width: 12 },
  { key: 'monnaie', header: 'MONNAIE', width: 9 },
  { key: 'date_val', header: 'DATE VAL', width: 12 },
  { key: 'date_ech', header: 'DATE ECH', width: 12 },
  { key: 'cif_lic', header: 'CIF LIC', width: 14, numFmt: MONEY },
  { key: 'num_av', header: 'NUM AV', width: 20 },
  { key: 'montant_av', header: 'MONTANT AV', width: 14, numFmt: MONEY },
  { key: 'ass_ref', header: 'ASS REF', width: 18 },
  { key: 'facture', header: 'FACTURE', width: 16 },
  { key: 'bl_lta', header: 'BL/LTA', width: 18 },
  { key: 'clearance_type', header: 'TYPE', width: 11 },
  { key: 'clearance_remark', header: 'REMARQUE', width: 20 },
];

function fileCells(r: ApurementFileRow): Record<string, unknown> {
  return {
    client: text(r.client_short),
    license_number: text(r.license_number),
    mca_ref: text(r.mca_ref),
    fob: r.fob,
    fret: r.fret,
    assurance: r.assurance,
    autres_frets: r.autres_frets,
    cif: r.cif,
    ref_decl: text(r.ref_decl),
    date_decl: day(r.date_decl),
    ref_liquid: text(r.ref_liquid),
    date_liquid: day(r.date_liquid),
    ref_quit: text(r.ref_quit),
    date_quit: day(r.date_quit),
    monnaie: text(r.monnaie),
    date_val: day(r.date_val),
    date_ech: day(r.date_ech),
    cif_lic: r.cif_lic,
    num_av: text(r.num_av),
    montant_av: r.montant_av,
    ass_ref: text(effectiveAssRef(r)),
    facture: text(r.facture),
    bl_lta: text(r.bl_lta),
    clearance_type: text(r.clearance_type),
    clearance_remark: text(r.clearance_remark),
  };
}

export function pendingSheet(files: ApurementFileRow[]): XlsxSheet {
  return { name: 'Pending', columns: FILE_COLUMNS, rows: files.map(fileCells), borders: true };
}

export function apuredSheet(files: ApuredFileRow[]): XlsxSheet {
  return {
    name: 'Apured',
    columns: [
      ...FILE_COLUMNS,
      { key: 'transmission_reference', header: 'TRANSMISSION REF', width: 18 },
      { key: 'transmission_date', header: 'DATE TRANSMISSION', width: 14 },
      { key: 'bank_name', header: 'BANQUE', width: 18 },
    ],
    rows: files.map((f) => ({
      ...fileCells(f),
      transmission_reference: f.transmission_reference,
      transmission_date: day(f.transmission_date),
      bank_name: text(f.bank_name),
    })),
    borders: true,
  };
}

/** One row per transmission — the dashboard list, as filtered. */
export function transmissionsSheet(list: TransmissionRow[]): XlsxSheet {
  return {
    name: 'Transmissions',
    columns: [
      { key: 'client', header: 'CLIENT', width: 10 },
      { key: 'reference', header: 'REFERENCE', width: 18 },
      { key: 'transmission_date', header: 'DATE', width: 12 },
      { key: 'date_depot', header: 'DATE DEPOT', width: 12 },
      { key: 'bank', header: 'BANQUE', width: 20 },
      { key: 'license_number', header: 'LICENCE', width: 22 },
      { key: 'files', header: 'NBRE DOSSIERS', width: 14, align: 'center' },
      { key: 'ar', header: 'ACCUSE DE RECEPTION', width: 28 },
    ],
    rows: list.map((t) => ({
      client: text(t.client_short),
      reference: t.transmission_reference,
      transmission_date: day(t.transmission_date),
      date_depot: day(t.date_depot),
      bank: text(t.bank_name),
      license_number: text(t.license_number),
      files: t.file_count,
      ar: t.ar_file_id ? text(t.ar_file_name) : 'Not received',
    })),
    borders: true,
  };
}

/**
 * The sheet that goes to the bank: the letterhead from Application Settings,
 * then "TRANSMIS POUR APUREMENT <client> N. <reference> DU <date>", then the
 * files. The legacy sheet printed two named staff members and their phone
 * numbers in code; whatever the operation wants on it now lives in the
 * letterhead text, where it can be changed without a deploy.
 */
export async function transmissionSheet(t: TransmissionRow, files: ApurementFileRow[]): Promise<XlsxSheet> {
  const branding = await loadBranding();
  const letterhead = (branding.letterhead_text ?? '')
    .split(/\r?\n/u)
    .map((l) => l.trim())
    .filter(Boolean);
  const title = `TRANSMIS POUR APUREMENT ${(t.client_short ?? '').toUpperCase()} N. ${t.transmission_reference} DU ${day(t.transmission_date)}`;
  return {
    name: t.transmission_reference,
    title: [branding.project_name, ...letterhead, `Banque : ${text(t.bank_name)} — Date dépôt : ${day(t.date_depot)}`, title],
    columns: [
      { key: 'mca_ref', header: 'FILE REF', width: 20 },
      { key: 'license_number', header: 'NUMERO DEC', width: 22 },
      { key: 'monnaie', header: 'MONNAIE', width: 9, align: 'center' },
      { key: 'date_val', header: 'DATE VALIDATION', width: 14, align: 'center' },
      { key: 'date_ech', header: 'DATE ECHEANCE', width: 14, align: 'center' },
      { key: 'cif', header: 'CIF', width: 14, numFmt: MONEY },
      { key: 'montant_apure', header: 'MONTANT APURE', width: 15, numFmt: MONEY },
      { key: 'num_av', header: 'NUMERO AV', width: 20 },
      { key: 'montant_av', header: 'MONTANT AV', width: 14, numFmt: MONEY },
      { key: 'facture', header: 'REF. FACTURE', width: 16 },
      { key: 'ref_decl', header: 'REF. DECLARATION', width: 17 },
      { key: 'date_decl', header: 'DATE DECLARATION', width: 15, align: 'center' },
      { key: 'ref_liquid', header: 'REF. LIQUIDATION', width: 17 },
      { key: 'date_liquid', header: 'DATE LIQUIDATION', width: 15, align: 'center' },
      { key: 'ref_quit', header: 'REF. QUITTANCE', width: 17 },
      { key: 'date_quit', header: 'DATE QUITTANCE', width: 15, align: 'center' },
      { key: 'ass_ref', header: 'REF. ASSURANCE', width: 18 },
      { key: 'bl_lta', header: 'BL/LTA', width: 18 },
      { key: 'clearance_type', header: 'TYPE PAIEMENT', width: 13, align: 'center' },
      { key: 'clearance_remark', header: 'REMARQUE', width: 20 },
    ],
    rows: files.map((f) => {
      const c = fileCells(f);
      // Montant apuré is the file's full CIF — the legacy sheet's own definition.
      return { ...c, montant_apure: f.cif };
    }),
    totalsRow: {
      mca_ref: `TOTAL (${files.length})`,
      cif: files.reduce((s, f) => s + f.cif, 0),
      montant_apure: files.reduce((s, f) => s + f.cif, 0),
    },
    borders: true,
  };
}
