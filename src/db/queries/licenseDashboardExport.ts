import { formatDate } from '@/lib/formatDate';
import type { XlsxSheet } from '@/lib/xlsx';
import {
  getLicenseClientDetail,
  getLicenseClients,
  getLicenseExpiry,
  getLicenseOverview,
} from './licenseDashboardTabs';
import type { LicenseUseFor } from './licenseFilters';
import type { LicenseDashboardExportQuery } from '@/schemas/license-dashboard';

// The Licence dashboard's spreadsheets.
//
// Built from the SAME query functions the screen renders, so a sheet can never
// disagree with the figure that produced it — main's export re-ran its own
// copies of eleven queries, which is how a card and its download come apart.
//
// Dates go through `formatDate`, because a spreadsheet leaves the office and
// is read by someone with no way to check what `03/04/2026` meant (§4.19).

const d = (v: unknown): string => formatDate(v as string | null, '');
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Sheet 1: every headline figure as a label/value pair. */
function summarySheet(kpi: Awaited<ReturnType<typeof getLicenseOverview>>['kpi']): XlsxSheet {
  const rows: Array<{ metric: string; value: number }> = [
    { metric: 'Total Licences', value: kpi.total },
    { metric: 'Active', value: kpi.active },
    { metric: 'Inactive', value: kpi.inactive },
    { metric: 'Modified', value: kpi.modified },
    { metric: 'Annulated', value: kpi.annulated },
    { metric: 'Prorogated', value: kpi.prorogated },
    { metric: 'Valid (not yet expired)', value: kpi.valid },
    { metric: 'Expired', value: kpi.expired },
    { metric: 'Expiring within 7 days', value: kpi.expiring_7 },
    { metric: 'Expiring within 15 days', value: kpi.expiring_15 },
    { metric: 'Expiring within 30 days', value: kpi.expiring_30 },
    { metric: 'Applied today', value: kpi.today },
    { metric: 'Applied yesterday', value: kpi.yesterday },
    { metric: 'Applied this week', value: kpi.this_week },
    { metric: 'Applied this month', value: kpi.this_month },
    { metric: 'Applied last month', value: kpi.last_month },
    { metric: 'Applied this year', value: kpi.this_year },
    { metric: 'Unique clients', value: kpi.unique_clients },
    { metric: 'Unique banks', value: kpi.unique_banks },
  ];
  return {
    name: 'Executive Summary',
    columns: [
      { key: 'metric', header: 'Metric', width: 30 },
      { key: 'value', header: 'Value', width: 16, align: 'right', numFmt: '#,##0' },
    ],
    rows,
    borders: true,
  };
}

function licensesSheet(rows: Awaited<ReturnType<typeof getLicenseOverview>>['rows']): XlsxSheet {
  return {
    name: 'All Licences',
    columns: [
      { key: 'license_number', header: 'Licence #', width: 24 },
      { key: 'client_name', header: 'Client', width: 18 },
      { key: 'bank_name', header: 'Bank', width: 20 },
      { key: 'invoice_number', header: 'Invoice #', width: 18 },
      { key: 'license_applied_date', header: 'Applied', width: 14 },
      { key: 'license_expiry_date', header: 'Expiry', width: 14 },
      { key: 'days_to_expiry', header: 'Days to Expiry', width: 14, align: 'right' },
      { key: 'status', header: 'Status', width: 14 },
    ],
    rows: rows.map((r) => ({
      license_number: s(r.license_number),
      client_name: s(r.client_name),
      bank_name: s(r.bank_name),
      invoice_number: s(r.invoice_number),
      license_applied_date: d(r.license_applied_date),
      license_expiry_date: d(r.license_expiry_date),
      days_to_expiry: r.days_to_expiry ?? '',
      status: s(r.status),
    })),
    borders: true,
  };
}

function expirySheet(rows: Awaited<ReturnType<typeof getLicenseExpiry>>['rows']): XlsxSheet {
  return {
    name: 'Expiry Analysis',
    columns: [
      { key: 'license_number', header: 'Licence #', width: 24 },
      { key: 'client_name', header: 'Client', width: 18 },
      { key: 'bank_name', header: 'Bank', width: 20 },
      { key: 'license_applied_date', header: 'Applied', width: 14 },
      { key: 'license_expiry_date', header: 'Expiry', width: 14 },
      { key: 'days_to_expiry', header: 'Days', width: 12, align: 'right' },
      { key: 'expiry_category', header: 'Category', width: 20 },
      { key: 'status', header: 'Status', width: 14 },
    ],
    rows: rows.map((r) => ({
      license_number: s(r.license_number),
      client_name: s(r.client_name),
      bank_name: s(r.bank_name),
      license_applied_date: d(r.license_applied_date),
      license_expiry_date: d(r.license_expiry_date),
      days_to_expiry: r.days_to_expiry ?? '',
      expiry_category: s(r.expiry_category),
      status: s(r.status),
    })),
    // Shade what needs acting on: an expired licence is a stopped consignment,
    // and a 400-row sheet is scanned rather than read.
    rowTone: (raw) => {
      const days = Number(raw.days_to_expiry);
      if (!Number.isFinite(days)) return null;
      if (days < 0) return 'danger';
      if (days <= 15) return 'warning';
      if (days <= 30) return 'muted';
      return 'success';
    },
    borders: true,
  };
}

/** One client's profile as a label/value sheet, plus its five breakdowns. */
function clientSheet(detail: NonNullable<Awaited<ReturnType<typeof getLicenseClientDetail>>>): XlsxSheet {
  const rows: Array<{ field: string; value: string }> = [
    { field: 'Client Code', value: s(detail.short_name) },
    { field: 'Company', value: s(detail.company_name) },
    { field: 'Contact', value: s(detail.contact_person) },
    { field: 'Email', value: s(detail.email) },
    { field: 'Payment Term', value: s(detail.payment_term) },
    { field: 'Status', value: detail.display === 'Y' ? 'Active' : 'Disabled' },
    { field: 'Total Licences', value: String(detail.total) },
    { field: 'Active Licences', value: String(detail.active) },
    { field: 'Success Rate', value: `${detail.success_rate}%` },
    { field: 'Last Licence', value: d(detail.last_license_date) },
  ];
  for (const [name, list] of Object.entries(detail.breakdowns)) {
    if (list.length === 0) continue;
    rows.push({ field: '', value: '' });
    rows.push({ field: `${name.toUpperCase()} BREAKDOWN`, value: '' });
    for (const b of list) rows.push({ field: b.label, value: `${b.count} licence(s)` });
  }
  return {
    name: 'Client Report',
    columns: [
      { key: 'field', header: 'Field', width: 30 },
      { key: 'value', header: 'Value', width: 36 },
    ],
    rows,
    borders: true,
  };
}

export async function buildLicenseDashboardExport(
  q: LicenseDashboardExportQuery,
): Promise<{ sheets: XlsxSheet[]; filename: string }> {
  const useFor = q.use_for as LicenseUseFor | undefined;
  const side = useFor ?? 'all';

  switch (q.scope) {
    case 'licenses': {
      const o = await getLicenseOverview(useFor);
      return { sheets: [licensesSheet(o.rows)], filename: `${side}-licences` };
    }
    case 'expiry': {
      const e = await getLicenseExpiry(useFor);
      return { sheets: [expirySheet(e.rows)], filename: `${side}-licence-expiry` };
    }
    case 'client': {
      const detail = await getLicenseClientDetail(q.client_id!, useFor);
      if (!detail) return { sheets: [], filename: 'client' };
      return {
        sheets: [clientSheet(detail)],
        filename: `client-${(detail.short_name ?? String(detail.id)).toLowerCase()}`,
      };
    }
    case 'dashboard': {
      // The whole dashboard in one workbook, a sheet per tab — the month-end
      // pack, rather than three separate downloads to staple together.
      const [o, e] = await Promise.all([getLicenseOverview(useFor), getLicenseExpiry(useFor)]);
      return {
        sheets: [summarySheet(o.kpi), licensesSheet(o.rows), expirySheet(e.rows)],
        filename: `${side}-licence-dashboard`,
      };
    }
  }
}

/** The client list, for a caller that wants every client's figures at once. */
export async function licenseClientsSheet(useFor?: LicenseUseFor): Promise<XlsxSheet> {
  const { clients } = await getLicenseClients(useFor);
  return {
    name: 'Clients',
    columns: [
      { key: 'short_name', header: 'Client', width: 18 },
      { key: 'company_name', header: 'Company', width: 36 },
      { key: 'total', header: 'Licences', width: 12, align: 'right' },
      { key: 'active', header: 'Active', width: 12, align: 'right' },
      { key: 'success_rate', header: 'Success Rate', width: 14, align: 'right' },
    ],
    rows: clients.map((c) => ({
      short_name: s(c.short_name),
      company_name: s(c.company_name),
      total: c.total,
      active: c.active,
      success_rate: c.success_rate,
    })),
    borders: true,
  };
}
