'use client';

import DataTable from '@/components/ui/DataTable';
import { formatDate } from '@/lib/formatDate';
import { nf2 } from '@/modules/tracking/dashboardUi';
import type { InvoiceRow } from '@/db/queries/invoiceDashboardTabs';
import type { InvoiceExportScope, InvoiceKind } from '@/schemas/invoice-dashboard';
import { exportHref, invoiceHref } from './useTabData';

/**
 * The invoice list every tab shows — one set of columns, one money format, one
 * empty state (§4.10).
 */
export default function InvoiceTable({
  kind,
  rows,
  loading,
  emptyMessage,
  scope = 'invoices',
  showAge = false,
}: {
  kind: InvoiceKind;
  rows: InvoiceRow[];
  loading: boolean;
  emptyMessage: string;
  scope?: InvoiceExportScope;
  showAge?: boolean;
}) {
  return (
    <DataTable<InvoiceRow>
      rows={rows}
      rowKey={(r) => r.id}
      loading={loading}
      searchPlaceholder="Search ref, client, goods, payment mode, status..."
      emptyMessage={emptyMessage}
      exportHref={exportHref(kind, scope)}
      columns={[
        { key: 'invoice_ref', header: 'Invoice Ref', sortable: true },
        { key: 'inv_date', header: 'Date', sortable: true, render: (r) => formatDate(r.inv_date) },
        {
          key: 'client_name',
          header: 'Client',
          sortable: true,
          // §4.15 — the column shows the code; searching accepts the legal
          // name too, so text from an outside document still finds the row.
          value: (r) => `${r.client_name ?? ''} ${r.client_company ?? ''}`.trim(),
          render: (r) => <span title={r.client_company ?? undefined}>{r.client_name ?? '—'}</span>,
        },
        { key: 'goods_type', header: 'Type of Goods', sortable: true },
        { key: 'payment_mode', header: 'Payment Mode', sortable: true },
        { key: 'status', header: 'Status', sortable: true, badge: true },
        ...(showAge
          ? [{ key: 'age_days', header: 'Age (days)', align: 'right' as const, sortable: true }]
          : []),
        {
          key: 'sub_total',
          header: 'Sub Total',
          align: 'right',
          sortable: true,
          defaultHidden: true,
          render: (r) => nf2.format(r.sub_total),
        },
        { key: 'vat', header: 'VAT', align: 'right', sortable: true, render: (r) => nf2.format(r.vat) },
        {
          key: 'total',
          header: 'Total (USD)',
          align: 'right',
          sortable: true,
          render: (r) => <strong className="text-foreground">{nf2.format(r.total)}</strong>,
        },
        {
          key: 'dgi_amount',
          header: 'DGI Amount',
          align: 'right',
          sortable: true,
          defaultHidden: true,
          render: (r) => nf2.format(r.dgi_amount),
        },
      ]}
      actions={(r) => ({ edit: invoiceHref(kind, r.id) })}
    />
  );
}
