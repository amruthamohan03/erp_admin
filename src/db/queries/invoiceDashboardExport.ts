import { formatDate } from '@/lib/formatDate';
import type { XlsxSheet } from '@/lib/xlsx';
import {
  getInvoiceClients,
  getInvoicePayment,
  getInvoiceRows,
  type ClientSummary,
  type Distribution,
  type InvoiceRow,
} from './invoiceDashboardTabs';
import type { InvoiceDashboardExportQuery, InvoiceKind } from '@/schemas/invoice-dashboard';

// The Export / Import Invoice dashboards' spreadsheets.
//
// Built from the SAME query functions the screen renders, so a sheet can never
// disagree with the figure that produced it (§4.15). Dates go through
// `formatDate` (§4.19); a sheet leaves the office, so the client cell carries
// the legal name beside the code (§4.15).

const d = (v: unknown): string => formatDate(v as string | null, '');
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const MONEY = '#,##0.00';
const right = 'right' as const;

const LABEL: Record<InvoiceKind, string> = { export: 'Export', import: 'Import' };

function invoiceSheet(name: string, rows: InvoiceRow[], withAge = false): XlsxSheet {
  return {
    name,
    borders: true,
    columns: [
      { key: 'invoice_ref', header: 'Invoice Ref', width: 24 },
      { key: 'inv_date', header: 'Date', width: 14 },
      { key: 'client_name', header: 'Client', width: 12 },
      { key: 'client_company', header: 'Client Name', width: 32 },
      { key: 'goods_type', header: 'Type of Goods', width: 20 },
      { key: 'payment_mode', header: 'Payment Mode', width: 16 },
      { key: 'status', header: 'Status', width: 18 },
      ...(withAge ? [{ key: 'age_days', header: 'Age (days)', width: 12, align: right }] : []),
      { key: 'sub_total', header: 'Sub Total (USD)', width: 16, align: right, numFmt: MONEY },
      { key: 'vat', header: 'VAT (USD)', width: 14, align: right, numFmt: MONEY },
      { key: 'total', header: 'Total (USD)', width: 16, align: right, numFmt: MONEY, bold: true },
      { key: 'dgi_amount', header: 'DGI Amount', width: 14, align: right, numFmt: MONEY },
    ],
    rows: rows.map((r) => ({
      invoice_ref: s(r.invoice_ref),
      inv_date: d(r.inv_date),
      client_name: s(r.client_name),
      client_company: s(r.client_company),
      goods_type: s(r.goods_type),
      payment_mode: r.payment_mode,
      status: r.status,
      age_days: r.age_days,
      sub_total: r.sub_total,
      vat: r.vat,
      total: r.total,
      dgi_amount: r.dgi_amount,
    })),
    totalsRow: {
      invoice_ref: `TOTAL (${rows.length})`,
      sub_total: rows.reduce((t, r) => t + r.sub_total, 0),
      vat: rows.reduce((t, r) => t + r.vat, 0),
      total: rows.reduce((t, r) => t + r.total, 0),
      dgi_amount: rows.reduce((t, r) => t + r.dgi_amount, 0),
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
      { key: 'count', header: 'Invoices', width: 10, align: right },
      { key: 'value_usd', header: 'Total (USD)', width: 16, align: right, numFmt: MONEY, bold: true },
      { key: 'vat_usd', header: 'VAT (USD)', width: 14, align: right, numFmt: MONEY },
      { key: 'avg_usd', header: 'Average (USD)', width: 14, align: right, numFmt: MONEY },
      { key: 'share_pct', header: 'Share %', width: 10, align: right, numFmt: '0.0' },
      { key: 'verified', header: 'DGI Verified', width: 12, align: right },
      { key: 'pending', header: 'Not Verified', width: 12, align: right },
      { key: 'last_date', header: 'Last Invoice', width: 14 },
    ],
    rows: clients.map((c) => ({
      client_name: s(c.client_name),
      client_company: s(c.client_company),
      count: c.count,
      value_usd: c.value_usd,
      vat_usd: c.vat_usd,
      avg_usd: c.avg_usd,
      share_pct: c.share_pct,
      verified: c.verified,
      pending: c.pending,
      last_date: d(c.last_date),
    })),
  };
}

function paymentSheet(modes: Distribution[]): XlsxSheet {
  return {
    name: 'Payment Mode',
    borders: true,
    columns: [
      { key: 'label', header: 'Payment Mode', width: 18 },
      { key: 'count', header: 'Invoices', width: 10, align: right },
      { key: 'value_usd', header: 'Total (USD)', width: 16, align: right, numFmt: MONEY, bold: true },
    ],
    rows: modes.map((m) => ({ label: m.label, count: m.count, value_usd: m.value_usd })),
  };
}

export async function buildInvoiceDashboardExport(
  kind: InvoiceKind,
  q: InvoiceDashboardExportQuery,
): Promise<{ sheets: XlsxSheet[]; filename: string }> {
  const prefix = `${kind}-invoice-dashboard`;
  switch (q.scope) {
    case 'invoices':
      return { sheets: [invoiceSheet(`${LABEL[kind]} Invoices`, await getInvoiceRows(kind))], filename: `${prefix}-invoices` };
    case 'pending':
      return {
        sheets: [invoiceSheet('Not DGI Verified', await getInvoiceRows(kind, true), true)],
        filename: `${prefix}-pending`,
      };
    case 'clients':
      return { sheets: [clientSheet((await getInvoiceClients(kind)).clients)], filename: `${prefix}-clients` };
    case 'payment':
      return { sheets: [paymentSheet((await getInvoicePayment(kind)).modes)], filename: `${prefix}-payment` };
    case 'dashboard': {
      const [rows, pending, clients, payment] = await Promise.all([
        getInvoiceRows(kind),
        getInvoiceRows(kind, true),
        getInvoiceClients(kind),
        getInvoicePayment(kind),
      ]);
      return {
        sheets: [
          invoiceSheet(`${LABEL[kind]} Invoices`, rows),
          clientSheet(clients.clients),
          invoiceSheet('Not DGI Verified', pending, true),
          paymentSheet(payment.modes),
        ],
        filename: prefix,
      };
    }
  }
}
