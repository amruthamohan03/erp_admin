'use client';

// §9 Import Bulk Update — the import binding of the shared filter-scoped mass
// editor. Everything but the field metadata, the scope shape and the extra
// Pre-Alert Date column lives in components/transactional/BulkUpdateModal (§4.10).
import BulkUpdateModal, { CONSIGNMENT_FILTERS } from '@/components/transactional/BulkUpdateModal';
import { FIELD_META } from '@/lib/imports/bulkFields';
import { formatDate } from '@/lib/formatDate';

// Every import milestone is validated against the pre-alert date, so it is shown
// beside the fields being dated (§4.19 for the format). Module-level so the prop
// keeps a stable identity across renders.
const LEAD_COLUMNS = [
  { header: 'Pre-Alert', render: (r: Record<string, unknown>) => formatDate(r.pre_alert_date) },
];

// A type alias, not an interface: only an alias is assignable to the shared
// modal's Record<string, ...> scope prop (an interface has no index signature).
export type BulkExtraProps = {
  client_id?: number;
  transport_mode_id?: number;
  type_of_goods_id?: number;
  pre_alert_from?: string;
  pre_alert_to?: string;
};

export default function ImportBulkUpdateModal({
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
      module="imports"
      fieldMeta={FIELD_META}
      statusFilters={statusFilters}
      scope={extra}
      filters={CONSIGNMENT_FILTERS}
      leadColumns={LEAD_COLUMNS}
      noun={{ one: 'File', many: 'Files' }}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
