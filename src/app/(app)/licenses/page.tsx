'use client';

import { CaseListPage, type ColumnDef } from '@/components/case/CaseListPage';

const STATES = [
  { value: '', label: 'All states' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'issued', label: 'Issued' },
  { value: 'cancelled', label: 'Cancelled' },
];

const COLUMNS: ColumnDef[] = [
  { key: 'license_no', label: 'License no.' },
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
  { key: 'license_type_id', label: 'Type' },
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
    key: 'issue_date',
    label: 'Issued',
    render: (row) => (row.issue_date == null ? '—' : String(row.issue_date)),
  },
];

export default function LicensesListPage() {
  return (
    <CaseListPage
      templateKey="license_default"
      title="Licenses"
      subtitle={
        <>
          Driven by case template <code>license_default</code> → target table{' '}
          <code>license_t</code>.
        </>
      }
      newHref="/licenses/new"
      newLabel="Issue license"
      getDetailHref={(row) => `/licenses/${row.id}`}
      states={STATES}
      columns={COLUMNS}
    />
  );
}
