'use client';

import { CaseListPage, type ColumnDef } from '@/components/case/CaseListPage';

const STATES = [
  { value: '', label: 'All states' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'applied', label: 'Applied' },
  { value: 'cancelled', label: 'Cancelled' },
];

const COLUMNS: ColumnDef[] = [
  { key: 'credit_note_number', label: 'Credit note no.' },
  {
    key: 'state',
    label: 'State',
    render: (row) => (
      <span className="text-xs uppercase tracking-wide text-slate-500">
        {String(row.state ?? '')}
      </span>
    ),
  },
  { key: 'invoice_id', label: 'Invoice' },
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
  {
    key: 'issued_date',
    label: 'Issued',
    render: (row) => (row.issued_date == null ? '—' : String(row.issued_date)),
  },
];

export default function CreditNotesListPage() {
  return (
    <CaseListPage
      templateKey="credit_note_default"
      title="Credit Notes"
      subtitle={
        <>
          Driven by case template <code>credit_note_default</code> → target table{' '}
          <code>credit_note_t</code>.
        </>
      }
      newHref="/credit-notes/new"
      newLabel="Issue credit note"
      getDetailHref={(row) => `/credit-notes/${row.id}`}
      states={STATES}
      columns={COLUMNS}
    />
  );
}
