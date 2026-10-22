import { formatDate } from '@/lib/formatDate';
import type { XlsxSheet } from '@/lib/xlsx';
import {
  getFicheClients,
  getFicheDuties,
  getFicheRows,
  type ClientSummary,
  type FicheRow,
  type HsCodeSummary,
  type OriginSummary,
} from './ficheDashboardTabs';
import { ficheWorkflow } from './fiches';
import type { FicheDashboardExportQuery } from '@/schemas/fiche-dashboard';

// The Fiche de Calcul dashboard's spreadsheets.
//
// Built from the SAME query functions the screen renders, so a sheet can never
// disagree with the figure that produced it (§4.15). Dates go through
// `formatDate` (§4.19); a sheet leaves the office, so the client cell carries
// the legal name beside the code (§4.15).

const d = (v: unknown): string => formatDate(v as string | null, '');
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const MONEY = '#,##0.00';
const right = 'right' as const;

function ficheSheet(name: string, rows: FicheRow[], withAge = false): XlsxSheet {
  return {
    name,
    borders: true,
    columns: [
      { key: 'fiche_reference', header: 'Fiche Reference', width: 28 },
      { key: 'fiche_date', header: 'Fiche Date', width: 14 },
      { key: 'client_name', header: 'Client', width: 12 },
      { key: 'client_company', header: 'Client Name', width: 32 },
      { key: 'license_number', header: 'License Number', width: 20 },
      { key: 'mca_ref', header: 'MCA Reference', width: 22 },
      { key: 'regime', header: 'Regime', width: 18 },
      { key: 'transport_mode', header: 'Transport Mode', width: 16 },
      { key: 'state', header: 'Status', width: 14 },
      ...(withAge ? [{ key: 'age_days', header: 'Age (days)', width: 12, align: right }] : []),
      { key: 'currency', header: 'Currency', width: 10 },
      { key: 'cif', header: 'CIF', width: 16, align: right, numFmt: MONEY },
      { key: 'coefficient', header: 'Coefficient', width: 12, align: right, numFmt: '0.000000' },
      { key: 'lines', header: 'Lines', width: 8, align: right },
      { key: 'ddi', header: 'DDI (CDF)', width: 18, align: right, numFmt: MONEY, bold: true },
      { key: 'verified_at', header: 'Verified On', width: 14 },
      { key: 'verified_by_name', header: 'Verified By', width: 20 },
      { key: 'audited_at', header: 'Audited On', width: 14 },
      { key: 'audited_by_name', header: 'Audited By', width: 20 },
    ],
    rows: rows.map((r) => ({
      fiche_reference: s(r.fiche_reference),
      fiche_date: d(r.fiche_date),
      client_name: s(r.client_name),
      client_company: s(r.client_company),
      license_number: s(r.license_number),
      mca_ref: s(r.mca_ref),
      regime: s(r.regime),
      transport_mode: s(r.transport_mode),
      state: r.state_label,
      age_days: r.age_days,
      currency: r.currency,
      cif: r.cif,
      coefficient: r.coefficient ?? '',
      lines: r.lines,
      ddi: r.ddi,
      verified_at: d(r.verified_at),
      verified_by_name: s(r.verified_by_name),
      audited_at: d(r.audited_at),
      audited_by_name: s(r.audited_by_name),
    })),
    // CIF is not totalled: the fiches may be in different currencies.
    totalsRow: {
      fiche_reference: `TOTAL (${rows.length})`,
      lines: rows.reduce((t, r) => t + r.lines, 0),
      ddi: rows.reduce((t, r) => t + r.ddi, 0),
    },
  };
}

function clientSheet(clients: ClientSummary[]): XlsxSheet {
  return {
    name: 'Clients',
    borders: true,
    columns: [
      { key: 'client_name', header: 'Client', width: 12 },
      { key: 'client_company', header: 'Client Name', width: 36 },
      { key: 'count', header: 'Fiches', width: 10, align: right },
      { key: 'currencies', header: 'CIF Currency', width: 12 },
      { key: 'cif', header: 'CIF', width: 16, align: right, numFmt: MONEY },
      { key: 'ddi', header: 'DDI (CDF)', width: 18, align: right, numFmt: MONEY, bold: true },
      { key: 'avg_ddi', header: 'Average DDI (CDF)', width: 18, align: right, numFmt: MONEY },
      { key: 'share_pct', header: 'DDI Share %', width: 12, align: right, numFmt: '0.0' },
      { key: 'last_date', header: 'Last Fiche', width: 14 },
    ],
    rows: clients.map((c) => ({
      client_name: s(c.client_name),
      client_company: s(c.client_company),
      count: c.count,
      currencies: s(c.currencies),
      cif: c.cif,
      ddi: c.ddi,
      avg_ddi: c.avg_ddi,
      share_pct: c.share_pct,
      last_date: d(c.last_date),
    })),
  };
}

function hsSheet(codes: HsCodeSummary[]): XlsxSheet {
  return {
    name: 'HS Codes',
    borders: true,
    columns: [
      { key: 'hs_code', header: 'HS Code', width: 16 },
      { key: 'description', header: 'Tariff Description', width: 40 },
      { key: 'lines', header: 'Lines', width: 8, align: right },
      { key: 'fiches', header: 'Fiches', width: 8, align: right },
      { key: 'avg_ddi_percent', header: 'Average DDI %', width: 14, align: right, numFmt: '0.00' },
      { key: 'ddi', header: 'DDI (CDF)', width: 18, align: right, numFmt: MONEY, bold: true },
    ],
    rows: codes.map((h) => ({
      hs_code: h.hs_code,
      description: s(h.description),
      lines: h.lines,
      fiches: h.fiches,
      avg_ddi_percent: h.avg_ddi_percent,
      ddi: h.ddi,
    })),
    totalsRow: {
      hs_code: 'TOTAL',
      lines: codes.reduce((t, h) => t + h.lines, 0),
      ddi: codes.reduce((t, h) => t + h.ddi, 0),
    },
  };
}

function originSheet(origins: OriginSummary[]): XlsxSheet {
  return {
    name: 'Origins',
    borders: true,
    columns: [
      { key: 'label', header: 'Origin', width: 18 },
      { key: 'lines', header: 'Lines', width: 8, align: right },
      { key: 'ddi', header: 'DDI (CDF)', width: 18, align: right, numFmt: MONEY, bold: true },
    ],
    rows: origins.map((o) => ({ label: o.label, lines: o.lines, ddi: o.ddi })),
  };
}

export async function buildFicheDashboardExport(
  q: FicheDashboardExportQuery,
): Promise<{ sheets: XlsxSheet[]; filename: string }> {
  const prefix = 'fiche-dashboard';
  switch (q.scope) {
    case 'fiches':
      return { sheets: [ficheSheet('Fiches', await getFicheRows())], filename: `${prefix}-fiches` };
    case 'waiting':
      return {
        sheets: [ficheSheet('In Progress', await getFicheRows(await ficheWorkflow()), true)],
        filename: `${prefix}-in-progress`,
      };
    case 'clients':
      return { sheets: [clientSheet((await getFicheClients()).clients)], filename: `${prefix}-clients` };
    case 'hscodes': {
      const duties = await getFicheDuties();
      return { sheets: [hsSheet(duties.hs_codes), originSheet(duties.origins)], filename: `${prefix}-hs-codes` };
    }
    case 'dashboard': {
      const wf = await ficheWorkflow();
      const [rows, waiting, clients, duties] = await Promise.all([
        getFicheRows(),
        getFicheRows(wf),
        getFicheClients(),
        getFicheDuties(),
      ]);
      return {
        sheets: [
          ficheSheet('Fiches', rows),
          ficheSheet('In Progress', waiting, true),
          clientSheet(clients.clients),
          hsSheet(duties.hs_codes),
          originSheet(duties.origins),
        ],
        filename: prefix,
      };
    }
  }
}
