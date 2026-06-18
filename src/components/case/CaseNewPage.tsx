'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DynamicForm } from '@/engine/forms/DynamicForm';
import type { FormDefinitionWithFields } from '@/engine/forms';

// Generic "create a case" page. Fetches the form via /api/v1/forms/{formKey},
// renders <DynamicForm>, POSTs to /api/v1/cases/{templateKey} on submit,
// then redirects to a detail page via successHref(caseId).

export interface CaseNewPageProps {
  templateKey: string;
  formKey: string;
  title: string;
  subtitle: React.ReactNode;
  backHref: string;
  backLabel: string;
  submitLabel: string;
  /** Where to send the user after successful creation. */
  successHref: (caseId: number) => string;
}

export function CaseNewPage({
  templateKey,
  formKey,
  title,
  subtitle,
  backHref,
  backLabel,
  submitLabel,
  successHref,
}: CaseNewPageProps) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormDefinitionWithFields | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/forms/${formKey}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) setForm(j.data);
        else setError(j.error?.message ?? 'Failed to load form');
      })
      .catch(() => {
        if (!cancelled) setError('Network error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [formKey]);

  async function onSubmit(values: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/cases/${templateKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        const msg = json.error?.message ?? 'Create failed';
        setError(msg);
        throw new Error(msg);
      }
      router.push(successHref(json.data.caseId));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        </div>
        <Link href={backHref} className="text-sm text-primary-600 hover:underline">
          {backLabel}
        </Link>
      </div>

      <div className="card p-6 max-w-2xl">
        {loading && <div className="text-sm text-slate-500">Loading form…</div>}
        {!loading && !form && (
          <div className="text-sm text-destructive">
            {error ?? 'Form definition not available.'}
          </div>
        )}
        {error && form && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {error}
          </div>
        )}
        {form && (
          <DynamicForm
            form={form}
            onSubmit={onSubmit}
            submitLabel={submitLabel}
            busy={submitting}
          />
        )}
      </div>
    </>
  );
}
