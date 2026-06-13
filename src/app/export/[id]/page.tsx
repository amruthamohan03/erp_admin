'use client';

import { use } from 'react';
import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — renders the runtime against master_page slug = 'export'.
// `[id]` is the exports_t row id, or the literal string 'new' for create.
export default function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TransactionalPage slug="export" entityId={id} />;
}
