'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import { safeFetchJson } from '@/lib/safeFetch';
import { parseDerive, isPureDerive, isAsyncDerive, computePureDerive } from '@/lib/pages/derive';
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

  // Flatten every field once per page load for derive bookkeeping.
  const allFields = useMemo(
    () => page?.accordions.flatMap((a) => a.fields) ?? [],
    [page],
  );

  // Fields whose change triggers an async (fromRelated / template) derive — e.g.
  // picking a license autofills kind/goods/currency/remaining, picking a client
  // fills Liquidation Paid By, and either rebuilds the MCA reference.
  const asyncTriggers = useMemo(() => {
    const s = new Set<string>();
    for (const f of allFields) {
      const spec = parseDerive(f.derive);
      if (isAsyncDerive(spec)) s.add(spec.trigger);
    }
    return s;
  }, [allFields]);

  // §4.12 — resolve async derives on the server and merge the returned values.
  const runAsyncDerive = useCallback(
    async (triggerField: string, current: Record<string, unknown>) => {
      const res = await fetch(`/api/pages/${slug}/derive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger_field: triggerField, values: current }),
      });
      const json: { success: boolean; data?: { values: Record<string, unknown> } } = await res.json();
      if (res.ok && json.success && json.data) {
        setValues((prev) => ({ ...prev, ...json.data!.values }));
      }
    },
    [slug],
  );

  const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
    setValues((prev) => {
      const next = { ...prev, [fieldName]: value };
      if (asyncTriggers.has(fieldName)) void runAsyncDerive(fieldName, next);
      return next;
    });
  }, [asyncTriggers, runAsyncDerive]);

  // Pure derives (statusMap / formula) recompute reactively from the current
  // values. Compare as strings so a numeric result doesn't churn against a
  // stringified field value.
  useEffect(() => {
    if (!page) return;
    let next: Record<string, unknown> | null = null;
    for (const f of allFields) {
      const spec = parseDerive(f.derive);
      if (!isPureDerive(spec)) continue;
      const computed = computePureDerive(spec, values);
      if (computed === undefined) continue;
      if (String(computed) !== String(values[f.name] ?? '')) {
        if (!next) next = { ...values };
        next[f.name] = computed;
      }
    }
    if (next) setValues(next);
  }, [values, page, allFields]);

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
              onSave={(visibleFieldNames) => saveAccordion(acc.slug, visibleFieldNames)}
              defaultOpen={idx === 0}
              entityType={`page:${slug}`}
              entityId={entityId}
            />
          ))}
        </form>
      )}
    </DashboardShell>
  );
}
