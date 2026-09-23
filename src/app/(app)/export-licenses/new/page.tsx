'use client';

import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'export-license'. entityId 'new' = create.
// Its own slug (not 'license') so the Kind picker can be scoped to export kinds
// and so saving returns to /export-licenses rather than the import list.
export default function NewExportLicensePage() {
  return <TransactionalPage slug="export-license" entityId="new" />;
}
