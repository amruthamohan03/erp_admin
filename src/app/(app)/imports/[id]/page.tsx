'use client';

import { use } from 'react';
import ImportBuilder from '@/components/imports/ImportBuilder';

export default function ImportEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const numId = parseInt(id, 10);
  return <ImportBuilder id={Number.isFinite(numId) ? numId : undefined} />;
}
