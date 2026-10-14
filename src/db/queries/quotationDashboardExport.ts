import { formatDate } from '@/lib/formatDate';
import type { XlsxSheet } from '@/lib/xlsx';
import {
  getQuotationCategories,
  getQuotationClientDetail,
  getQuotationClients,
  getQuotationOverview,
  getQuotationValue,
  type QuotationRow,
} from './quotationDashboardTabs';
import type { QuotationDashboardExportQuery } from '@/schemas/quotation-dashboard';

// The Quotation dashboard's spreadsheets.
//
// Built from the SAME query functions the screen renders, so a sheet can never
// disagree with the figure that produced it — the defect §4.15 names, in its
// export form: a download whose numbers differ from the card that was clicked.
//
// Dates go through `formatDate`, because a spreadsheet leaves the office and is
// read by someone with no way to check what `03/04/2026` meant (§4.19).

const d = (v: unknown): string => formatDate(v as string | null, '');
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const MONEY = '#,##0.00';

/** The money format every value column shares, so no sheet rounds differently. */
const quotationColumns = [
  { key: 'quotation_ref', header: 'Quotation Ref', width: 24 },
  { key: 'quotation_date', header: 'Date', width: 14 },
  { key: 'client_name', header: 'Client', width: 14 },
  { key: 'kind_name', header: 'Kind', width: 20 },
  { key: 'transport_mode_name', header: 'Transport', width: 16 },
  { key: 'goods_type', header: 'Type of Goods', width: 20 },
  { key: 'line_count', header: 'Lines', width: 8, align: 'right' as const },
  { key: 'sub_total', header: 'Sub Total (USD)', width: 16, align: 'right' as const, numFmt: MONEY },
  { key: 'vat_amount', header: 'VAT (USD)', width: 14, align: 'right' as const, numFmt: MONEY },
  { key: 'arsp_amount', header: 'ARSP (USD)', width: 14, align: 'right' as const, numFmt: MONEY },
  { key: 'total_amount', header: 'Total (USD)', width: 16, align: 'right' as const, numFmt: MONEY },
  { key: 'total_amount_cdf', header: 'Total (CDF)', width: 18, align: 'right' as const, numFmt: MONEY },
];

function quotationSheet(name: string, rows: QuotationRow[]): XlsxSheet {
  return {
    name,
    columns: quotationColumns,
    rows: rows.map((r) => ({
      quotation_ref: s(r.quotation_ref),
      quotation_date: d(r.quotation_date),
      client_name: s(r.client_name),
      kind_name: s(r.kind_name),
      transport_mode_name: s(r.transport_mode_name),
      goods_type: s(r.goods_type),
      line_count: r.line_count,
      sub_total: r.sub_total,
      vat_amount: r.vat_amount,
      arsp_amount: r.arsp_amount,
      total_amount: r.total_amount,
      total_amount_cdf: r.total_amount_cdf ?? '',
    })),
    // The sheet's own total, so the reader does not have to trust that their
    // selection caught every row.
    totalsRow: {
      quotation_ref: 'TOTAL',
      line_count: rows.reduce((n, r) => n + r.line_count, 0),
      sub_total: rows.reduce((n, r) => n + r.sub_total, 0),
      vat_amount: rows.reduce((n, r) => n + r.vat_amount, 0),
      arsp_amount: rows.reduce((n, r) => n + r.arsp_amount, 0),
      total_amount: rows.reduce((n, r) => n + r.total_amount, 0),
      total_amount_cdf: rows.reduce((n, r) => n + (r.total_amount_cdf ?? 0), 0),
    },
    borders: true,
  };
}

/** Sheet 1: every headline figure as a label/value pair. */
function summarySheet(
  kpi: Awaited<ReturnType<typeof getQuotationOverview>>['kpi'],
  value: Awaited<ReturnType<typeof getQuotationValue>>['kpi'],
): XlsxSheet {
  const rows: Array<{ metric: string; value: number }> = [
    { metric: 'Total Quotations', value: kpi.total },
    { metric: 'Total Value (USD)', value: kpi.total_usd },
    { metric: 'Sub Total (USD)', value: kpi.sub_total_usd },
    { metric: 'VAT (USD)', value: kpi.vat_usd },
    { metric: 'ARSP (USD)', value: kpi.arsp_usd },
    { metric: 'Total Value (CDF)', value: kpi.total_cdf },
    { metric: 'Average Value (USD)', value: value.avg_usd },
    { metric: 'Median Value (USD)', value: value.median_usd },
    { metric: 'Largest Quotation (USD)', value: value.max_usd },
    { metric: 'Quotations with ARSP enabled', value: kpi.arsp_enabled },
    { metric: 'Quotations carrying CDF', value: kpi.with_cdf },
    { metric: 'Unique Clients', value: kpi.unique_clients },
    { metric: 'Unique Kinds', value: kpi.unique_kinds },
    { metric: 'Dated today', value: kpi.today },
    { metric: 'Dated this week', value: kpi.this_week },
    { metric: 'Dated this month', value: kpi.this_month },
    { metric: 'Dated last month', value: kpi.last_month },
    { metric: 'Dated this year', value: kpi.this_year },
    { metric: 'No quotation date', value: kpi.no_date },
  ];
  return {
    name: 'Executive Summary',
    columns: [
      { key: 'metric', header: 'Metric', width: 32 },
      { key: 'value', header: 'Value', width: 18, align: 'right', numFmt: MONEY },
    ],
    rows,
    borders: true,
  };
}

function categoriesSheet(c: Awaited<ReturnType<typeof getQuotationCategories>>): XlsxSheet {
  return {
    name: 'Categories',
    columns: [
      { key: 'category_name', header: 'Category', width: 32 },
      { key: 'is_customs', header: 'Customs', width: 10 },
      { key: 'lines', header: 'Lines', width: 10, align: 'right' },
      { key: 'quotations', header: 'Quotations', width: 12, align: 'right' },
      { key: 'with_tva', header: 'With TVA', width: 10, align: 'right' },
      { key: 'tva_usd', header: 'TVA (USD)', width: 16, align: 'right', numFmt: MONEY },
      { key: 'value_usd', header: 'Value (USD)', width: 16, align: 'right', numFmt: MONEY },
      { key: 'value_cdf', header: 'Value (CDF)', width: 18, align: 'right', numFmt: MONEY },
    ],
    rows: c.categories.map((r) => ({
      category_name: s(r.category_name),
      is_customs: r.is_customs ? 'Yes' : 'No',
      lines: r.lines,
      quotations: r.quotations,
      with_tva: r.with_tva,
      tva_usd: r.tva_usd,
      value_usd: r.value_usd,
      value_cdf: r.value_cdf,
    })),
    totalsRow: {
      category_name: 'TOTAL',
      lines: c.categories.reduce((n, r) => n + r.lines, 0),
      tva_usd: c.categories.reduce((n, r) => n + r.tva_usd, 0),
      value_usd: c.categories.reduce((n, r) => n + r.value_usd, 0),
      value_cdf: c.categories.reduce((n, r) => n + r.value_cdf, 0),
    },
    borders: true,
  };
}

function itemsSheet(c: Awaited<ReturnType<typeof getQuotationCategories>>): XlsxSheet {
  return {
    name: 'Top Items',
    columns: [
      { key: 'item_name', header: 'Item', width: 36 },
      { key: 'category_name', header: 'Category', width: 28 },
      { key: 'lines', header: 'Lines', width: 10, align: 'right' },
      { key: 'quantity', header: 'Quantity', width: 12, align: 'right', numFmt: MONEY },
      { key: 'value_usd', header: 'Value (USD)', width: 16, align: 'right', numFmt: MONEY },
    ],
    rows: c.items.map((r) => ({
      item_name: s(r.item_name),
      category_name: s(r.category_name),
      lines: r.lines,
      quantity: r.quantity,
      value_usd: r.value_usd,
    })),
    borders: true,
  };
}

function clientsSheet(c: Awaited<ReturnType<typeof getQuotationClients>>): XlsxSheet {
  return {
    name: 'Clients',
    columns: [
      { key: 'short_name', header: 'Client', width: 14 },
      { key: 'company_name', header: 'Company', width: 36 },
      { key: 'total', header: 'Quotations', width: 12, align: 'right' },
      { key: 'value_usd', header: 'Value (USD)', width: 18, align: 'right', numFmt: MONEY },
      { key: 'avg_usd', header: 'Average (USD)', width: 16, align: 'right', numFmt: MONEY },
      { key: 'last_quotation_date', header: 'Last Quotation', width: 16 },
    ],
    rows: c.clients.map((r) => ({
      short_name: s(r.short_name),
      company_name: s(r.company_name),
      total: r.total,
      value_usd: r.value_usd,
      avg_usd: r.avg_usd,
      last_quotation_date: d(r.last_quotation_date),
    })),
    totalsRow: {
      short_name: 'TOTAL',
      total: c.clients.reduce((n, r) => n + r.total, 0),
      value_usd: c.clients.reduce((n, r) => n + r.value_usd, 0),
    },
    borders: true,
  };
}

/** One client's profile as a label/value sheet, plus its breakdowns. */
function clientSheet(detail: NonNullable<Awaited<ReturnType<typeof getQuotationClientDetail>>>): XlsxSheet {
  const rows: Array<{ field: string; value: string }> = [
    { field: 'Client Code', value: s(detail.short_name) },
    { field: 'Company', value: s(detail.company_name) },
    { field: 'Contact', value: s(detail.contact_person) },
    { field: 'Email', value: s(detail.email) },
    { field: 'Payment Term', value: s(detail.payment_term) },
    { field: 'Status', value: detail.display === 'Y' ? 'Active' : 'Disabled' },
    { field: 'Total Quotations', value: String(detail.total) },
    { field: 'Total Value (USD)', value: detail.value_usd.toFixed(2) },
    { field: 'Average Value (USD)', value: detail.avg_usd.toFixed(2) },
    { field: 'Largest Quotation (USD)', value: detail.max_usd.toFixed(2) },
    { field: 'Total Lines', value: String(detail.lines) },
    { field: 'Last Quotation', value: d(detail.last_quotation_date) },
  ];
  for (const [name, list] of Object.entries(detail.breakdowns)) {
    if (list.length === 0) continue;
    rows.push({ field: '', value: '' });
    rows.push({ field: `${name.toUpperCase()} BREAKDOWN`, value: '' });
    for (const b of list) {
      rows.push({ field: b.label, value: `${b.count} quotation(s) — ${b.value_usd.toFixed(2)} USD` });
    }
  }
  return {
    name: 'Client Report',
    columns: [
      { key: 'field', header: 'Field', width: 30 },
      { key: 'value', header: 'Value', width: 42 },
    ],
    rows,
    borders: true,
  };
}

export async function buildQuotationDashboardExport(
  q: QuotationDashboardExportQuery,
): Promise<{ sheets: XlsxSheet[]; filename: string }> {
  switch (q.scope) {
    case 'quotations': {
      const o = await getQuotationOverview();
      return { sheets: [quotationSheet('Quotations', o.rows)], filename: 'quotations' };
    }
    case 'categories': {
      const c = await getQuotationCategories();
      return { sheets: [categoriesSheet(c), itemsSheet(c)], filename: 'quotation-categories' };
    }
    case 'client': {
      const detail = await getQuotationClientDetail(q.client_id!);
      if (!detail) return { sheets: [], filename: 'client' };
      return {
        sheets: [clientSheet(detail), quotationSheet('Recent Quotations', detail.recent)],
        filename: `client-${(detail.short_name ?? String(detail.id)).toLowerCase()}`,
      };
    }
    case 'dashboard': {
      // The whole dashboard in one workbook, a sheet per tab — the month-end
      // pack, rather than four separate downloads to staple together.
      const [o, v, c, cl] = await Promise.all([
        getQuotationOverview(),
        getQuotationValue(),
        getQuotationCategories(),
        getQuotationClients(),
      ]);
      return {
        sheets: [
          summarySheet(o.kpi, v.kpi),
          quotationSheet('Quotations', o.rows),
          categoriesSheet(c),
          itemsSheet(c),
          clientsSheet(cl),
        ],
        filename: 'quotation-dashboard',
      };
    }
  }
}
