'use client';

import { use } from 'react';
import ClientBuilder from '@/components/clients/ClientBuilder';

export default function ClientEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const numId = parseInt(id, 10);
  return <ClientBuilder id={Number.isFinite(numId) ? numId : undefined} />;
}
