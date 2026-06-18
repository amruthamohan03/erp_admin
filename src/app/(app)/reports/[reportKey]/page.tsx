'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChartBar, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DynamicForm } from '@/engine/forms/DynamicForm';
import type { FormDefinitionWithFields } from '@/engine/forms';

interface ReportColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'money' | 'status';
  align?: 'left' | 'right' | 'center';
}

interface ReportDefinition {
  id: number;
  reportKey: string;
  name: string;
  description: string | null;
  category: string | null;
  columns: ReportColumn[];
  parameterFormKey: string | null;
}

interface ReportRun {
  reportKey: string;
  name: string;
  columns: ReportColumn[];
  rows: Array<Record<string, unknown>>;
  ranAt: string;
}

function formatCell(value: unknown, column: ReportColumn): string {
  if (value == null) return '—';
  switch (column.type) {
    case 'money':
      if (typeof value === 'number')
        return value.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      return String(value);
    case 'number':
      if (typeof value === 'number') return value.toLocaleString();
      return String(value);
    case 'date':
      return String(value);
    default:
      return String(value);
  }
}

function alignClass(column: ReportColumn): string {
  switch (column.align) {
    case 'right':
      return 'text-right';
    case 'center':
      return 'text-center';
    default:
      return '';
  }
}

export default function ReportRunnerPage() {
  const params = useParams<{ reportKey: string }>();
  const reportKey = params?.reportKey;

  const [definition, setDefinition] = React.useState<ReportDefinition | null>(null);
  const [parameterForm, setParameterForm] = React.useState<FormDefinitionWithFields | null>(null);
  const [loadingDef, setLoadingDef] = React.useState(true);
  const [defError, setDefError] = React.useState<string | null>(null);

  const [running, setRunning] = React.useState(false);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ReportRun | null>(null);

  // Load the report definition + parameter form (if any) in one effect so
  // the runner page can render either a "Run" button (parameterless) or
  // the parameter form straight away.
  React.useEffect(() => {
    if (!reportKey) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/reports/${reportKey}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setDefError(json.error?.message ?? 'Failed to load report');
          return;
        }
        const def: ReportDefinition = json.data;
        setDefinition(def);

        if (def.parameterFormKey) {
          const formRes = await fetch(`/api/v1/forms/${def.parameterFormKey}`);
          const formJson = await formRes.json();
          if (cancelled) return;
          if (formRes.ok && formJson.ok) {
            setParameterForm(formJson.data);
          } else {
            setDefError(formJson.error?.message ?? 'Failed to load parameter form');
          }
        }
      } catch {
        if (!cancelled) setDefError('Network error');
      } finally {
        if (!cancelled) setLoadingDef(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportKey]);

  async function run(params: Record<string, unknown> | undefined) {
    if (!reportKey) return;
    setRunning(true);
    setRunError(null);
    setResult(null);
    try {
      const body = params ? { params } : {};
      const res = await fetch(`/api/v1/reports/${reportKey}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setRunError(json.error?.message ?? 'Run failed');
        return;
      }
      setResult(json.data);
    } catch {
      setRunError('Network error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ChartBar className="h-6 w-6 text-primary-600" />
            {definition?.name ?? 'Report'}
          </h1>
          {definition?.description && (
            <p className="text-sm text-slate-500 mt-1">{definition.description}</p>
          )}
        </div>
        <Link href="/reports" className="text-sm text-slate-600 hover:underline">
          ← All reports
        </Link>
      </div>

      {loadingDef && (
        <div className="text-sm text-slate-500">Loading report…</div>
      )}
      {defError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {defError}
        </div>
      )}

      {definition && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card p-6">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">
              Parameters
            </div>
            {!definition.parameterFormKey && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">
                  No parameters — run directly.
                </p>
                <Button onClick={() => run(undefined)} disabled={running}>
                  <Play className="h-4 w-4 mr-1" />
                  {running ? 'Running…' : 'Run report'}
                </Button>
              </div>
            )}
            {definition.parameterFormKey && parameterForm && (
              <DynamicForm
                form={parameterForm}
                onSubmit={(values) => run(values)}
                submitLabel={running ? 'Running…' : 'Run report'}
                busy={running}
              />
            )}
            {runError && (
              <div className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700 border border-red-200">
                {runError}
              </div>
            )}
          </div>

          <div className="card p-6 lg:col-span-2">
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Results
              </div>
              {result && (
                <div className="text-xs text-slate-400">
                  Ran at {new Date(result.ranAt).toLocaleString()} ·{' '}
                  {result.rows.length} row{result.rows.length === 1 ? '' : 's'}
                </div>
              )}
            </div>
            {!result && (
              <div className="text-sm text-slate-500">
                Run the report to see results.
              </div>
            )}
            {result && result.rows.length === 0 && (
              <div className="text-sm text-slate-500">No rows.</div>
            )}
            {result && result.rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      {result.columns.map((c) => (
                        <th key={c.key} className={alignClass(c)}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, idx) => (
                      <tr key={idx}>
                        {result.columns.map((c) => (
                          <td key={c.key} className={alignClass(c)}>
                            {formatCell(row[c.key], c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
