'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import { safeFetchJson } from '@/lib/safeFetch';
import type { PageDef, PageFetchResponse } from '@/types';
import Accordion from './Accordion';

interface TransactionalPageProps {
  slug: string;
  entityId: string;
}

export default function TransactionalPage({ slug, entityId }: TransactionalPageProps) {
  const router = useRouter();
  const [page, setPage] = useState<PageDef | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const url = entityId === 'new'
      ? `/api/pages/${slug}`
      : `/api/pages/${slug}?entity_id=${entityId}`;
    const result = await safeFetchJson<PageFetchResponse>(url);
    if (!result.ok) {
      setError(
        [
          result.message,
          result.status ? `(status ${result.status})` : null,
          result.detail ? `\nDetail: ${result.detail}` : null,
        ].filter(Boolean).join(' '),
      );
      setLoading(false);
      return;
    }
    setPage(result.data.page);
    setValues(result.data.values ?? {});
    setLoading(false);
  }, [slug, entityId]);

  useEffect(() => { load(); }, [load]);

  const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldName]: value }));
  }, []);

  const saveAccordion = useCallback(async (accordionSlug: string, fieldNames: string[]) => {
    const payloadValues: Record<string, unknown> = {};
    for (const name of fieldNames) {
      payloadValues[name] = values[name] ?? null;
    }
    const res = await fetch(`/api/pages/${slug}/${entityId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accordion_slug: accordionSlug, values: payloadValues }),
    });
    const json: { success: boolean; data?: { id: number }; message?: string } = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Save failed');
    }
    // If we just created a new entity, navigate to its canonical edit URL so
    // subsequent saves target that id instead of staying on /new.
    if (entityId === 'new' && json.data?.id) {
      router.replace(`/${slug}/${json.data.id}`);
    }
  }, [slug, entityId, values, router]);

  return (
    <DashboardShell>
      {/* §4.13 — Back goes to the page's own list view (e.g. /clients) so
          refresh + back still lands somewhere useful for the user. */}
      <div className="mb-4">
        <BackButton fallback={page ? page.route : '/dashboard'} />
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {page?.title ?? 'Loading...'}
          {entityId === 'new' && page && <span className="ml-2 text-sm font-normal text-slate-500">— New</span>}
        </h1>
      </div>

      {loading && (
        <div className="card p-6 text-center text-slate-500">Loading page definition...</div>
      )}

      {!loading && error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {!loading && !error && page && (
        <form onSubmit={(e) => e.preventDefault()}>
          {page.accordions.map((acc, idx) => (
            <Accordion
              key={acc.id}
              accordion={acc}
              values={values}
              onChange={handleFieldChange}
              onSave={() => saveAccordion(acc.slug, acc.fields.map((f) => f.name))}
              defaultOpen={idx === 0}
            />
          ))}
        </form>
      )}
    </DashboardShell>
  );
}
