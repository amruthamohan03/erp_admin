'use client';

import { use } from 'react';
import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — master_page slug 'import'. `[id]` is the imports_t row id.
export default function ImportEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <TransactionalPage slug="import" entityId={id} />;
}
