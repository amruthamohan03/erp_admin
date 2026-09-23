'use client';

import { use } from 'react';
import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'export-license'. `[id]` is license_t.id;
// export licences live in the same table, told apart by kind.
export default function ExportLicenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TransactionalPage slug="export-license" entityId={id} />;
}
