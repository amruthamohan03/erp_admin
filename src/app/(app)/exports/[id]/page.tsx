'use client';

import { use } from 'react';
import ExportBuilder from '@/components/exports/ExportBuilder';

export default function ExportEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const numId = parseInt(id, 10);
  return <ExportBuilder id={Number.isFinite(numId) ? numId : undefined} />;
}
