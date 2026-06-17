'use client';

import { CaseListPage, type ColumnDef } from '@/components/case/CaseListPage';

const STATES = [
  { value: '', label: 'All states' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'issued', label: 'Issued' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];

const COLUMNS: ColumnDef[] = [
  { key: 'invoice_number', label: 'Invoice no.' },
  {
    key: 'state',
    label: 'State',
    render: (row) => (
      <span className="text-xs uppercase tracking-wide text-slate-500">
        {String(row.state ?? '')}
      </span>
    ),
  },
  { key: 'client_id', label: 'Client' },
  {
    key: 'license_id',
    label: 'License',
    render: (row) => (row.license_id == null ? '—' : String(row.license_id)),
  },
  {
    key: 'amount',
    label: 'Amount',
    className: 'text-right',
    headerClassName: 'text-right',
    render: (row) =>
      row.amount != null ? (
        <>
          {String(row.amount)}{' '}
          <span className="text-xs text-slate-400">
            {String(row.currency ?? '')}
          </span>
        </>
      ) : (
        '—'
      ),
  },
  {
    key: 'due_date',
    label: 'Due',
    render: (row) => (row.due_date == null ? '—' : String(row.due_date)),
  },
];

export default function InvoicesListPage() {
  return (
    <CaseListPage
      templateKey="invoice_default"
      title="Invoices"
      subtitle={
        <>
          Driven by case template <code>invoice_default</code> → target table{' '}
          <code>invoice_t</code>.
        </>
      }
      newHref="/invoices/new"
      newLabel="Issue invoice"
      getDetailHref={(row) => `/invoices/${row.id}`}
      states={STATES}
      columns={COLUMNS}
    />
  );
}
