'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import DashboardShell from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';

const TEMPLATE_KEY = 'invoice_default';

interface LoadedCase {
  caseId: number;
  templateKey: string;
  state: string;
  entity: Record<string, unknown>;
  availableTransitions: Array<{
    id: number;
    transitionKey: string;
    fromState: string;
    toState: string;
  }>;
}

const HIDDEN_COLS = new Set(['id', 'created_by', 'updated_by']);

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const caseId = params?.id;

  const [data, setData] = React.useState<LoadedCase | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/cases/${TEMPLATE_KEY}/${caseId}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? 'Failed to load invoice');
        setData(null);
        return;
      }
      setData(json.data);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function advance(transitionKey: string) {
    if (!caseId) return;
    setBusyKey(transitionKey);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/v1/cases/${TEMPLATE_KEY}/${caseId}/transitions/${transitionKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? 'Transition failed');
        return;
      }
      setNotice(
        `${json.data.previousState} → ${json.data.newState}` +
          (json.data.sideEffects?.length
            ? ` · ${json.data.sideEffects.length} side effect(s) queued`
            : ''),
      );
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <DashboardShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Invoice #{caseId}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Template <code>{TEMPLATE_KEY}</code> · target table{' '}
            <code>invoice_t</code>
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/invoices"
            className="text-sm text-slate-600 hover:underline"
          >
            ← Back
          </Link>
          <Link
            href="/invoices/new"
            className="text-sm text-primary-600 hover:underline"
          >
            + New
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 border border-emerald-200">
          {notice}
        </div>
      )}

      {loading && <div className="text-sm text-slate-500">Loading…</div>}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card p-6 space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                State
              </div>
              <div className="mt-1 text-lg font-medium">{data.state}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                Fields
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {Object.entries(data.entity)
                  .filter(([k]) => !HIDDEN_COLS.has(k))
                  .map(([k, v]) => (
                    <React.Fragment key={k}>
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="text-slate-900">{formatValue(v)}</dd>
                    </React.Fragment>
                  ))}
              </dl>
            </div>
          </div>

          <div className="card p-6">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">
              Available transitions
            </div>
            {data.availableTransitions.length === 0 && (
              <div className="text-sm text-slate-500">
                No transitions available from <code>{data.state}</code>.
              </div>
            )}
            <div className="space-y-2">
              {data.availableTransitions.map((t) => (
                <Button
                  key={t.id}
                  variant="outline"
                  className="w-full justify-between"
                  disabled={busyKey !== null}
                  onClick={() => advance(t.transitionKey)}
                >
                  <span className="font-medium">{t.transitionKey}</span>
                  <span className="text-xs text-slate-500">
                    → {t.toState}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

function formatValue(v: unknown): string {
  if (v == null) return '—';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
