'use client';

import { use } from 'react';
import TransactionalPage from '@/components/transactional/TransactionalPage';

// §4.12 page shim — renders the metadata runtime against master_page slug
// 'clients'. `[id]` is the client_master_t row id.
export default function ClientEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <TransactionalPage slug="clients" entityId={id} />;
}
