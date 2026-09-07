'use client';

// §8 Export Bulk Update — the export binding of the shared filter-scoped mass
// editor. Everything but the field metadata, the scope shape and the extra
// Loading Date column lives in components/transactional/BulkUpdateModal (§4.10).
import BulkUpdateModal, { CONSIGNMENT_FILTERS } from '@/components/transactional/BulkUpdateModal';
import { FIELD_META } from '@/lib/exports/bulkFields';
import { formatDate } from '@/lib/formatDate';

// The date every export milestone is validated against — the operator needs it in
// view to know which truck they are dating (§4.19 for the format). Module-level so
// the prop keeps a stable identity across renders.
const LEAD_COLUMNS = [
  { header: 'Loading Date', render: (r: Record<string, unknown>) => formatDate(r.loading_date) },
];

// A type alias, not an interface: only an alias is assignable to the shared
// modal's Record<string, ...> scope prop (an interface has no index signature).
export type BulkExtraProps = {
  client_id?: number;
  transport_mode_id?: number;
  type_of_goods_id?: number;
  loading_from?: string;
  loading_to?: string;
};

export default function ExportBulkUpdateModal({
  statusFilters,
  extra,
  onClose,
  onSaved,
}: {
  statusFilters: string[];
  extra: BulkExtraProps;
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  return (
    <BulkUpdateModal
      module="exports"
      fieldMeta={FIELD_META}
      statusFilters={statusFilters}
      scope={extra}
      filters={CONSIGNMENT_FILTERS}
      leadColumns={LEAD_COLUMNS}
      noun={{ one: 'Export', many: 'Exports' }}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
