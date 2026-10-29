'use client';

import { useEffect, useState } from 'react';
import { Download, Mail, MessageCircle, Paperclip, X } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDateTime } from '@/lib/formatDate';
import { formatBytes } from '@/lib/messaging/attachments';
import { sanitizeHtml } from '@/lib/messaging/richText';
import type { OutboundDetail } from '@/db/queries/outboundMessages';

// A sent message in full: who it went to, how each recipient fared, what it
// said and what was attached. Read-only — a sent message cannot be changed.

const STATUS_LABEL: Record<string, string> = { sent: 'Sent', partial: 'Partial', failed: 'Failed', sending: 'Sending' };

export default function OutboundDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const [row, setRow] = useState<OutboundDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await safeFetchJson<OutboundDetail>(`/api/v1/outbound-messages/${id}`);
      if (cancelled) return;
      if (res.ok) setRow(res.data);
      else setError(res.message);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const Icon = row?.channel === 'whatsapp' ? MessageCircle : Mail;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="card flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Sent message"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
            <Icon className="h-5 w-5 shrink-0 text-primary-600" />
            <span className="truncate" title={row?.subject}>
              {row ? row.subject || (row.channel === 'whatsapp' ? 'WhatsApp message' : 'Email') : 'Sent message'}
            </span>
          </h2>
          <button type="button" onClick={onClose} title="Close" className="ico">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
          {!row && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
          {row && (
            <>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {[
                  ['Channel', row.channel === 'whatsapp' ? 'WhatsApp' : 'Email'],
                  ['Status', <StatusBadge key="s" status={STATUS_LABEL[row.status] ?? row.status} />],
                  ['Sent by', row.sent_by_name ?? '—'],
                  ['Sent', formatDateTime(row.sent_at ?? row.created_at)],
                  ['To', row.to_recipients.join(', ')],
                  ...(row.cc_recipients.length ? [['Cc', row.cc_recipients.join(', ')]] : []),
                  ...(row.bcc_recipients.length ? [['Bcc', row.bcc_recipients.join(', ')]] : []),
                ].map(([label, value]) => (
                  <div key={String(label)} className="min-w-0">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                    <dd className="break-words text-sm text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>

              {row.error && (
                <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  {row.error}
                </div>
              )}

              <h3 className="mb-2 mt-6 text-sm font-semibold text-foreground">Message</h3>
              <div
                className="prose-message rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-foreground"
                // Sanitised on the way in; sanitised again here so a row written
                // by any other path still cannot inject markup into this page.
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(row.body_html) }}
              />

              {row.attachments.length > 0 && (
                <>
                  <h3 className="mb-2 mt-6 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Paperclip className="h-4 w-4" /> Attachments
                  </h3>
                  <ul className="space-y-1.5">
                    {row.attachments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                        <span className="min-w-0 truncate text-foreground" title={a.name}>{a.name}</span>
                        <span className="flex shrink-0 items-center gap-3">
                          {a.size != null && <span className="text-xs text-muted-foreground">{formatBytes(a.size)}</span>}
                          <a href={`/api/v1/files/${a.id}/view`} target="_blank" rel="noreferrer" className="btn-neutral btn-sm">
                            <Download className="h-3.5 w-3.5" /> Download
                          </a>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {row.results.length > 0 && (
                <>
                  <h3 className="mb-2 mt-6 text-sm font-semibold text-foreground">Delivery per recipient</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="px-3 py-2 font-semibold text-foreground">Recipient</th>
                          <th className="px-3 py-2 font-semibold text-foreground">Result</th>
                          <th className="px-3 py-2 font-semibold text-foreground">Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.results.map((r) => (
                          <tr key={r.recipient} className="border-b border-border align-top">
                            <td className="px-3 py-2 text-foreground">{r.recipient}</td>
                            <td className="px-3 py-2">
                              <StatusBadge status={r.status === 'sent' ? 'Sent' : 'Failed'} />
                            </td>
                            <td className="max-w-[22rem] break-words px-3 py-2 text-muted-foreground">
                              {r.error ?? (r.provider_id ? `Reference ${r.provider_id}` : '—')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}
