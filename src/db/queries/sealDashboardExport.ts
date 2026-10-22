import { formatDate } from '@/lib/formatDate';
import type { XlsxSheet } from '@/lib/xlsx';
import {
  getBatchRows,
  getClientUsage,
  getFileRows,
  getOfficeStock,
  getSealRows,
  type BatchRow,
  type ClientUsage,
  type FileRow,
  type OfficeStock,
  type SealRow,
} from './sealDashboardTabs';
import type { SealDashboardExportQuery } from '@/schemas/seal-dashboard';

// The Seal Tracker dashboard's spreadsheets.
//
// Built from the SAME query functions the screen renders, so a sheet can never
// disagree with the figure that produced it (§4.15). Dates go through
// `formatDate` (§4.19); a sheet leaves the office, so the client cell carries
// the legal name beside the code (§4.15).

const d = (v: string | null): string => formatDate(v, '');
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const MONEY = '#,##0.00';
const right = 'right' as const;

function sealSheet(rows: SealRow[]): XlsxSheet {
  return {
    name: 'Seals',
    borders: true,
    columns: [
      { key: 'seal_number', header: 'Seal Number', width: 20 },
      { key: 'status', header: 'Status', width: 12 },
      { key: 'office_name', header: 'Office', width: 18 },
      { key: 'batch_id', header: 'Batch #', width: 9, align: right },
      { key: 'purchase_date', header: 'Purchase Date', width: 14 },
      { key: 'updated_on', header: 'Last Changed', width: 14 },
      { key: 'files', header: 'Export Files', width: 36 },
      { key: 'notes', header: 'Notes', width: 30 },
    ],
    rows: rows.map((r) => ({
      seal_number: r.seal_number,
      status: r.status,
      office_name: r.office_name,
      batch_id: r.batch_id,
      purchase_date: d(r.purchase_date),
      updated_on: d(r.updated_on),
      files: r.files,
      notes: s(r.notes),
    })),
    rowTone: (row) => (row.status === 'Damaged' ? 'danger' : null),
  };
}

function officeSheet(rows: OfficeStock[]): XlsxSheet {
  return {
    name: 'Stock by Office',
    borders: true,
    columns: [
      { key: 'office_name', header: 'Office', width: 20 },
      { key: 'batches', header: 'Batches', width: 10, align: right },
      { key: 'purchased', header: 'Purchased', width: 11, align: right },
      { key: 'registered', header: 'Registered', width: 11, align: right },
      { key: 'available', header: 'Available', width: 11, align: right, bold: true },
      { key: 'used', header: 'Used', width: 10, align: right },
      { key: 'damaged', header: 'Damaged', width: 10, align: right },
      { key: 'spend_usd', header: 'Spend (USD)', width: 14, align: right, numFmt: MONEY },
      { key: 'low_stock', header: 'Low Stock', width: 11 },
    ],
    rows: rows.map((r) => ({ ...r, low_stock: r.low_stock ? 'Yes' : 'No' })),
    rowTone: (row) => (row.low_stock === 'Yes' ? 'warning' : null),
    totalsRow: {
      office_name: `TOTAL (${rows.length})`,
      batches: rows.reduce((t, r) => t + r.batches, 0),
      purchased: rows.reduce((t, r) => t + r.purchased, 0),
      registered: rows.reduce((t, r) => t + r.registered, 0),
      available: rows.reduce((t, r) => t + r.available, 0),
      used: rows.reduce((t, r) => t + r.used, 0),
      damaged: rows.reduce((t, r) => t + r.damaged, 0),
      spend_usd: rows.reduce((t, r) => t + r.spend_usd, 0),
    },
  };
}

function batchSheet(rows: BatchRow[]): XlsxSheet {
  return {
    name: 'Batches',
    borders: true,
    columns: [
      { key: 'id', header: 'Batch #', width: 9, align: right },
      { key: 'purchase_date', header: 'Purchase Date', width: 14 },
      { key: 'office_name', header: 'Office', width: 18 },
      { key: 'sub_office_code', header: 'Sub Office', width: 12 },
      { key: 'total_seal', header: 'Total Seals', width: 11, align: right },
      { key: 'total_amount', header: 'Cost (USD)', width: 14, align: right, numFmt: MONEY, bold: true },
      { key: 'cost_per_seal', header: 'Cost / Seal', width: 12, align: right, numFmt: MONEY },
      { key: 'registered', header: 'Registered', width: 11, align: right },
      { key: 'available', header: 'Available', width: 11, align: right },
      { key: 'used', header: 'Used', width: 9, align: right },
      { key: 'damaged', header: 'Damaged', width: 10, align: right },
      { key: 'used_pct', header: '% Used', width: 9, align: right, numFmt: '0.0' },
    ],
    rows: rows.map((r) => ({ ...r, purchase_date: d(r.purchase_date), sub_office_code: s(r.sub_office_code) })),
    totalsRow: {
      id: `TOTAL (${rows.length})`,
      total_seal: rows.reduce((t, r) => t + r.total_seal, 0),
      total_amount: rows.reduce((t, r) => t + r.total_amount, 0),
      registered: rows.reduce((t, r) => t + r.registered, 0),
      available: rows.reduce((t, r) => t + r.available, 0),
      used: rows.reduce((t, r) => t + r.used, 0),
      damaged: rows.reduce((t, r) => t + r.damaged, 0),
    },
  };
}

function fileSheet(rows: FileRow[]): XlsxSheet {
  return {
    name: 'Export Files',
    borders: true,
    columns: [
      { key: 'mca_ref', header: 'MCA Ref', width: 22 },
      { key: 'used_on', header: 'Date', width: 14 },
      { key: 'client_name', header: 'Client', width: 10 },
      { key: 'client_company', header: 'Client Name', width: 32 },
      { key: 'seal_count', header: 'Seals Listed', width: 12, align: right, bold: true },
      { key: 'number_of_seals', header: 'No. of Seals', width: 12, align: right },
      { key: 'seals', header: 'Seal Numbers', width: 40 },
      { key: 'unregistered', header: 'Not in Register', width: 14, align: right },
    ],
    rows: rows.map((r) => ({
      mca_ref: s(r.mca_ref) || `export #${r.export_id}`,
      used_on: d(r.used_on),
      client_name: s(r.client_name),
      client_company: s(r.client_company),
      seal_count: r.seal_count,
      number_of_seals: r.number_of_seals ?? '',
      seals: r.seals,
      unregistered: r.unregistered,
    })),
    totalsRow: {
      mca_ref: `TOTAL (${rows.length})`,
      seal_count: rows.reduce((t, r) => t + r.seal_count, 0),
    },
  };
}

function clientSheet(rows: ClientUsage[]): XlsxSheet {
  return {
    name: 'Clients',
    borders: true,
    columns: [
      { key: 'client_name', header: 'Client', width: 10 },
      { key: 'client_company', header: 'Client Name', width: 36 },
      { key: 'files', header: 'Files', width: 9, align: right },
      { key: 'seals', header: 'Seals', width: 9, align: right, bold: true },
      { key: 'share_pct', header: 'Share %', width: 10, align: right, numFmt: '0.0' },
      { key: 'last_date', header: 'Last File', width: 14 },
    ],
    rows: rows.map((c) => ({
      client_name: s(c.client_name),
      client_company: s(c.client_company),
      files: c.files,
      seals: c.seals,
      share_pct: c.share_pct,
      last_date: d(c.last_date),
    })),
  };
}

export async function buildSealDashboardExport(
  q: SealDashboardExportQuery,
): Promise<{ sheets: XlsxSheet[]; filename: string }> {
  const prefix = 'seal-dashboard';
  switch (q.scope) {
    case 'seals':
      return { sheets: [sealSheet(await getSealRows())], filename: `${prefix}-seals` };
    case 'offices':
      return { sheets: [officeSheet(await getOfficeStock())], filename: `${prefix}-offices` };
    case 'batches':
      return { sheets: [batchSheet(await getBatchRows())], filename: `${prefix}-batches` };
    case 'files':
      return { sheets: [fileSheet(await getFileRows())], filename: `${prefix}-files` };
    case 'clients':
      return { sheets: [clientSheet(await getClientUsage())], filename: `${prefix}-clients` };
    case 'dashboard': {
      const [offices, batches, seals, files, clients] = await Promise.all([
        getOfficeStock(),
        getBatchRows(),
        getSealRows(),
        getFileRows(),
        getClientUsage(),
      ]);
      return {
        sheets: [officeSheet(offices), batchSheet(batches), sealSheet(seals), fileSheet(files), clientSheet(clients)],
        filename: prefix,
      };
    }
  }
}
