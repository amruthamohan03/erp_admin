'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/layout/DashboardShell';
import { DynamicForm } from '@/engine/forms/DynamicForm';
import type { FormDefinitionWithFields } from '@/engine/forms';

const TEMPLATE_KEY = 'license_default';
const FORM_KEY = 'license_create';

export default function NewLicensePage() {
  const router = useRouter();
  const [form, setForm] = React.useState<FormDefinitionWithFields | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/forms/${FORM_KEY}`)
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
  }, []);

  async function onSubmit(values: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/cases/${TEMPLATE_KEY}`, {
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
      router.push(`/licenses/${json.data.caseId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Issue a license</h1>
          <p className="text-sm text-slate-500 mt-1">
            Driven by the <code>license_create</code> form definition + the{' '}
            <code>license_default</code> workflow.
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-primary-600 hover:underline">
          ← Back to dashboard
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
            submitLabel="Create license"
            busy={submitting}
          />
        )}
      </div>
    </DashboardShell>
  );
}
