'use client';

import { CaseListPage, type ColumnDef } from '@/components/case/CaseListPage';

const STATES = [
  { value: '', label: 'All states' },
  { value: 'initiated', label: 'Initiated' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const COLUMNS: ColumnDef[] = [
  { key: 'tracking_number', label: 'Tracking no.' },
  {
    key: 'state',
    label: 'State',
    render: (row) => (
      <span className="text-xs uppercase tracking-wide text-slate-500">
        {String(row.state ?? '')}
      </span>
    ),
  },
  { key: 'license_id', label: 'License' },
  { key: 'template_id', label: 'Template' },
  {
    key: 'current_milestone_key',
    label: 'Current milestone',
    render: (row) =>
      row.current_milestone_key == null
        ? '—'
        : String(row.current_milestone_key),
  },
  {
    key: 'started_at',
    label: 'Started',
    render: (row) => (row.started_at == null ? '—' : String(row.started_at)),
  },
];

export default function TrackingListPage() {
  return (
    <CaseListPage
      templateKey="tracking_default"
      title="Tracking"
      subtitle={
        <>
          Driven by case template <code>tracking_default</code> → target table{' '}
          <code>tracking_t</code>. Per-tracking milestone chain comes from the
          run&rsquo;s <code>tracking_template_master_t</code> row.
        </>
      }
      newHref="/tracking/new"
      newLabel="Start tracking"
      getDetailHref={(row) => `/tracking/${row.id}`}
      states={STATES}
      columns={COLUMNS}
    />
  );
}
