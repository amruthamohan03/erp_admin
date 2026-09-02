'use client';

import { useEffect, useState } from 'react';
import { History, X } from 'lucide-react';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDateTime } from '@/lib/formatDate';

// §4.28 — an update must show a per-field before → after diff, not two opaque
// snapshots. This is where an investigation actually reads what changed.

export interface AuditDetail {
  id: string;
  created_at: string;
  actor_id: number | null;
  actor_name: string | null;
  actor_role: string | null;
  actor_type: string;
  action: string;
  module: string | null;
  entity_type: string;
  entity_id: string;
  ip_address: string | null;
  user_agent: string | null;
  change_count: number;
  before: unknown;
  after: unknown;
  diff: Record<string, { from: unknown; to: unknown }> | null;
  metadata: Record<string, unknown> | null;
}

/** Field keys are stored as they are in the DB; read them the way the UI does. */
function humanize(key: string): string {
  return key.replace(/_/gu, ' ').replace(/\b\w/gu, (c) => c.toUpperCase());
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function AuditDetailDialog({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const [entry, setEntry] = useState<AuditDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    safeFetchJson<AuditDetail>(`/api/v1/audit-log/${id}`).then((res) => {
      if (!live) return;
      if (res.ok) setEntry(res.data);
      else setError(res.message);
    });
    return () => { live = false; };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const diffRows = entry?.diff ? Object.entries(entry.diff) : [];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold text-foreground">
            <History className="h-5 w-5 text-primary-600" />
            Audit entry
          </h2>
          <button type="button" onClick={onClose} title="Close" className="ico">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
          {!entry && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

          {entry && (
            <>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {[
                  ['When', formatDateTime(entry.created_at)],
                  ['User', entry.actor_name ?? (entry.actor_type === 'system' ? 'System' : '—')],
                  ['Role', entry.actor_role ?? '—'],
                  ['Action', humanize(entry.action)],
                  ['Module', entry.module ?? '—'],
                  ['Record', `${entry.entity_type} #${entry.entity_id}`],
                  ['IP address', entry.ip_address ?? '—'],
                  ['Device / browser', entry.user_agent ?? '—'],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                    <dd className="break-words text-sm text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>

              <h3 className="mt-6 mb-2 text-sm font-semibold text-foreground">
                {diffRows.length > 0
                  ? `What changed (${diffRows.length} field${diffRows.length === 1 ? '' : 's'})`
                  : 'What changed'}
              </h3>

              {diffRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No field-level changes were recorded for this action.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-3 py-2 font-semibold text-foreground">Field</th>
                        <th className="px-3 py-2 font-semibold text-foreground">Before</th>
                        <th className="px-3 py-2 font-semibold text-foreground">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diffRows.map(([field, change]) => (
                        <tr key={field} className="border-b border-border align-top">
                          <td className="px-3 py-2 font-medium text-foreground">{humanize(field)}</td>
                          <td className="max-w-[16rem] break-words px-3 py-2 text-muted-foreground line-through">
                            {display(change.from)}
                          </td>
                          <td className="max-w-[16rem] break-words px-3 py-2 text-foreground">
                            {display(change.to)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                <>
                  <h3 className="mt-6 mb-2 text-sm font-semibold text-foreground">Context</h3>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                    {Object.entries(entry.metadata).map(([k, v]) => (
                      <div key={k} className="min-w-0">
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                          {humanize(k)}
                        </dt>
                        <dd className="break-words text-sm text-foreground">{display(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </>
          )}
        </div>

        {/* §4.21 — a labelled way out, not just the X. */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
