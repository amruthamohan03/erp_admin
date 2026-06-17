'use client';

import { CaseListPage, type ColumnDef } from '@/components/case/CaseListPage';

const STATES = [
  { value: '', label: 'All states' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'level_1_approved', label: 'L1 approved' },
  { value: 'level_2_approved', label: 'L2 approved' },
  { value: 'fully_approved', label: 'Fully approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const COLUMNS: ColumnDef[] = [
  { key: 'request_number', label: 'Request no.' },
  {
    key: 'state',
    label: 'State',
    render: (row) => (
      <span className="text-xs uppercase tracking-wide text-slate-500">
        {String(row.state ?? '')}
      </span>
    ),
  },
  {
    key: 'current_approval_level',
    label: 'Level',
    render: (row) => `${row.current_approval_level ?? 0}/3`,
  },
  { key: 'client_id', label: 'Client' },
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
  { key: 'purpose', label: 'Purpose' },
];

export default function PaymentRequestsListPage() {
  return (
    <CaseListPage
      templateKey="payment_request_default"
      title="Payment requests"
      subtitle={
        <>
          Driven by case template <code>payment_request_default</code> → target
          table <code>payment_request_t</code> with three-stage approval gates.
        </>
      }
      newHref="/payment-requests/new"
      newLabel="New request"
      getDetailHref={(row) => `/payment-requests/${row.id}`}
      states={STATES}
      columns={COLUMNS}
    />
  );
}
