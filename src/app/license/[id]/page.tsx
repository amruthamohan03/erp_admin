'use client';

import { use } from 'react';
import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — renders the runtime against master_page slug = 'license'.
// `[id]` is the licenses_t row id, or the literal string 'new' for create.
export default function LicensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TransactionalPage slug="license" entityId={id} />;
}
