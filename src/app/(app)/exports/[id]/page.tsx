'use client';

import { use } from 'react';
import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'export'. `[id]` is the exports_t row id.
export default function ExportEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <TransactionalPage slug="export" entityId={id} />;
}
