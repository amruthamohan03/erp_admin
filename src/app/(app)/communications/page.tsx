'use client';

// Communication → Email & WhatsApp: write to clients, users, or any address or
// number, with a formatted body and attachments. Below, every message sent from
// here and how each recipient fared.
//
// The composer runs the same `sendOutboundSchema` and `attachmentError` the
// route does, so a problem is named before the upload rather than after it
// (§4.23); the route checks it all again.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Mail, MessageCircle, Paperclip, Send, Trash2, Upload } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import RichTextEditor from '@/components/ui/RichTextEditor';
import FieldMessages from '@/components/ui/FieldMessages';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import RecipientInput from '@/modules/communications/RecipientInput';
import OutboundDetailDialog from '@/modules/communications/OutboundDetailDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDateTime } from '@/lib/formatDate';
import { summarizeZodError } from '@/lib/validation/messages';
import { attachmentError, formatBytes, MAX_ATTACHMENTS, MAX_TOTAL_ATTACHMENT_BYTES } from '@/lib/messaging/attachments';
import { sanitizeHtml } from '@/lib/messaging/richText';
import { CHANNEL_NOT_CONFIGURED } from '@/lib/messaging/setup';
import { cn } from '@/lib/utils';
import {
  SUBJECT_MAX,
  WHATSAPP_TEXT_MAX,
  sendOutboundSchema,
  whatsappText,
  type OutboundChannel,
} from '@/schemas/outboundMessages';
import type { DirectoryEntry, OutboundListItem } from '@/db/queries/outboundMessages';
import type { OutboundResult } from '@/db/schema';

const CHANNELS: Array<{ value: OutboundChannel; label: string; icon: typeof Mail }> = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
];
const STATUS_LABEL: Record<string, string> = { sent: 'Sent', partial: 'Partial', failed: 'Failed', sending: 'Sending' };
const CHANNEL_FILTER = [
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
];
const STATUS_FILTER = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));

type FieldErrors = Partial<Record<'to' | 'cc' | 'bcc' | 'subject' | 'message' | 'attachments', string>>;

export default function CommunicationsPage() {
  const [channel, setChannel] = useState<OutboundChannel>('email');
  // Kept apart per channel — switching to WhatsApp must not throw away the
  // email addresses already chosen, nor try to dial them.
  const [emailTo, setEmailTo] = useState<string[]>([]);
  const [phoneTo, setPhoneTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCopies, setShowCopies] = useState(false);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [directory, setDirectory] = useState<{ emails: DirectoryEntry[]; phones: DirectoryEntry[] }>({ emails: [], phones: [] });
  const [configured, setConfigured] = useState<Record<OutboundChannel, boolean> | null>(null);

  const [rows, setRows] = useState<OutboundListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewId, setViewId] = useState<number | null>(null);

  const to = channel === 'email' ? emailTo : phoneTo;
  const setTo = channel === 'email' ? setEmailTo : setPhoneTo;

  useEffect(() => {
    void safeFetchJson<{ emails: DirectoryEntry[]; phones: DirectoryEntry[] }>('/api/v1/outbound-messages/recipients').then(
      (res) => {
        if (res.ok) setDirectory(res.data);
      },
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) p.set('q', search.trim());
    if (channelFilter) p.set('channel', channelFilter);
    if (statusFilter) p.set('status', statusFilter);
    const res = await safeFetchJson<OutboundListItem[]>(`/api/v1/outbound-messages?${p}`);
    if (res.ok) {
      setRows(res.data);
      setTotal(typeof res.meta?.total === 'number' ? res.meta.total : res.data.length);
      setConfigured({
        email: res.meta?.email_configured === true,
        whatsapp: res.meta?.whatsapp_configured === true,
      });
    } else {
      setRows([]);
      setTotal(0);
      setResult({ status: 'error', title: 'Could not load sent messages', message: res.message });
    }
    setLoading(false);
  }, [page, pageSize, search, channelFilter, statusFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const waLength = useMemo(
    () => (channel === 'whatsapp' ? whatsappText(subject, sanitizeHtml(bodyHtml)).length : 0),
    [channel, subject, bodyHtml],
  );
  const waPreview = useMemo(
    () => (channel === 'whatsapp' ? whatsappText(subject, sanitizeHtml(bodyHtml)) : ''),
    [channel, subject, bodyHtml],
  );
  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  const addFiles = (picked: FileList | File[]): void => {
    const next = [...files];
    for (const f of Array.from(picked)) {
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    const problem = attachmentError(next);
    setErrors((e) => ({ ...e, attachments: problem ?? undefined }));
    // A file that breaks a rule is not added, so the list on screen is always sendable.
    if (!problem) setFiles(next);
  };

  const reset = (): void => {
    setEmailTo([]);
    setPhoneTo([]);
    setCc([]);
    setBcc([]);
    setShowCopies(false);
    setSubject('');
    setBodyHtml('');
    setFiles([]);
    setErrors({});
  };

  const send = async (): Promise<void> => {
    const parsed = sendOutboundSchema.safeParse({ channel, to, cc, bcc, subject, message: bodyHtml });
    const attachmentProblem = attachmentError(files);
    if (!parsed.success || attachmentProblem) {
      const summary = parsed.success ? null : summarizeZodError(parsed.error);
      const next: FieldErrors = {};
      for (const [key, messages] of Object.entries(summary?.fields ?? {})) {
        next[key as keyof FieldErrors] = messages[0];
      }
      if (attachmentProblem) next.attachments = attachmentProblem;
      setErrors(next);
      setResult({
        status: 'error',
        title: 'Not sent',
        message: summary?.message ?? attachmentProblem ?? 'Check the fields marked in red.',
      });
      return;
    }
    setErrors({});
    setSending(true);
    const body = new FormData();
    body.set('channel', channel);
    body.set('to', JSON.stringify(to));
    body.set('cc', JSON.stringify(channel === 'email' ? cc : []));
    body.set('bcc', JSON.stringify(channel === 'email' ? bcc : []));
    body.set('subject', subject);
    body.set('message', bodyHtml);
    for (const f of files) body.append('attachments', f);

    const res = await safeFetchJson<{ id: number; status: string; error: string | null; results: OutboundResult[] }>(
      '/api/v1/outbound-messages',
      { method: 'POST', body },
    );
    setSending(false);
    if (!res.ok) {
      const field = res.field as keyof FieldErrors | undefined;
      if (field) setErrors({ [field]: res.fieldMessages?.[field]?.[0] ?? res.message });
      setResult({ status: 'error', title: 'Not sent', message: res.message });
      // A provider refusal is still recorded — show it in the log.
      void load();
      return;
    }
    const sent = res.data.results.filter((r) => r.status === 'sent').length;
    const noun = channel === 'email' ? 'email' : 'WhatsApp message';
    if (res.data.status === 'partial') {
      const failed = res.data.results.filter((r) => r.status === 'failed').map((r) => r.recipient);
      setResult({
        status: 'error',
        title: 'Partly sent',
        message: `The ${noun} reached ${sent} of ${res.data.results.length} recipients. Not delivered to ${failed.join(', ')}.`,
        detail: res.data.error ?? undefined,
      });
    } else {
      setResult({
        status: 'success',
        title: 'Sent',
        message: `The ${noun}${subject.trim() ? ` "${subject.trim()}"` : ''} was sent to ${sent} recipient${sent === 1 ? '' : 's'}.`,
      });
    }
    reset();
    setPage(1);
    void load();
  };

  const notReady = configured && !configured[channel];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Send className="h-5 w-5 text-primary-600" /> Email &amp; WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground">
          Write to clients, users, or any address or number — with formatting and attachments.
        </p>
      </div>

      <div className="card mb-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-gradient px-4 py-3 text-white">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Send className="h-4 w-4" /> New message
          </h2>
          <div role="radiogroup" aria-label="Send by" className="flex gap-1 rounded-lg bg-white/15 p-1">
            {CHANNELS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={channel === c.value}
                onClick={() => {
                  setChannel(c.value);
                  setErrors({});
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors',
                  channel === c.value ? 'bg-white text-primary-700 shadow' : 'text-white/90 hover:bg-white/15',
                )}
              >
                <c.icon className="h-3.5 w-3.5" /> {c.label}
              </button>
            ))}
          </div>
        </div>

        {notReady && (
          <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{CHANNEL_NOT_CONFIGURED[channel]}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 p-4">
          <div className="min-w-0">
            <div className="flex items-center justify-between">
              <label htmlFor="out-to" className="label required">
                To {channel === 'email' ? '(email addresses)' : '(WhatsApp numbers)'}
              </label>
              {channel === 'email' && !showCopies && (
                <button type="button" onClick={() => setShowCopies(true)} className="mb-1 text-xs font-medium text-primary-600 hover:underline">
                  Add Cc / Bcc
                </button>
              )}
            </div>
            <RecipientInput
              key={channel}
              id="out-to"
              channel={channel}
              values={to}
              onChange={(v) => {
                setTo(v);
                setErrors((e) => ({ ...e, to: undefined }));
              }}
              directory={channel === 'email' ? directory.emails : directory.phones}
              placeholder={
                channel === 'email'
                  ? 'Type a name, client code or address — press Enter to add'
                  : 'Type a name, client code or number with country code (+243…) — press Enter to add'
              }
              required
              invalid={Boolean(errors.to)}
              aria-label="To"
            />
            <FieldMessages error={errors.to} />
          </div>

          {channel === 'email' && showCopies && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="out-cc" className="label">Cc</label>
                <RecipientInput id="out-cc" channel="email" field="cc" values={cc} onChange={setCc} directory={directory.emails} invalid={Boolean(errors.cc)} aria-label="Cc" />
                <FieldMessages error={errors.cc} />
              </div>
              <div className="min-w-0">
                <label htmlFor="out-bcc" className="label">Bcc</label>
                <RecipientInput id="out-bcc" channel="email" field="bcc" values={bcc} onChange={setBcc} directory={directory.emails} invalid={Boolean(errors.bcc)} aria-label="Bcc" />
                <FieldMessages error={errors.bcc} />
              </div>
            </div>
          )}

          <div className="min-w-0">
            <label htmlFor="out-subject" className={channel === 'email' ? 'label required' : 'label'}>
              Subject{channel === 'whatsapp' ? ' (optional — sent in bold as the first line)' : ''}
            </label>
            <input
              id="out-subject"
              className="input"
              value={subject}
              maxLength={SUBJECT_MAX}
              onChange={(e) => {
                setSubject(e.target.value);
                setErrors((x) => ({ ...x, subject: undefined }));
              }}
              required={channel === 'email'}
              aria-invalid={errors.subject ? true : undefined}
              placeholder="What is it about?"
            />
            <FieldMessages error={errors.subject} />
          </div>

          <div className="min-w-0">
            <label htmlFor="out-body" className="label required">Message</label>
            <RichTextEditor
              id="out-body"
              value={bodyHtml}
              onChange={(html) => {
                setBodyHtml(html);
                setErrors((x) => ({ ...x, message: undefined }));
              }}
              placeholder="Write your message"
              invalid={Boolean(errors.message)}
              aria-label="Message"
            />
            <FieldMessages error={errors.message} />
            {channel === 'whatsapp' && (
              <p className={cn('mt-1 text-right text-xs', waLength > WHATSAPP_TEXT_MAX ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                {waLength} / {WHATSAPP_TEXT_MAX} characters
              </p>
            )}
          </div>

          {channel === 'whatsapp' && waPreview && (
            <div className="min-w-0">
              <p className="label">As it will arrive on WhatsApp</p>
              <div className="max-w-xl whitespace-pre-wrap break-words rounded-lg rounded-tl-none border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-foreground dark:border-emerald-500/30 dark:bg-emerald-500/10">
                {waPreview}
              </div>
            </div>
          )}

          <div className="min-w-0">
            <span className="label">Attachments</span>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={cn(
                'flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed px-4 py-3 text-sm transition-colors',
                dragging ? 'border-primary-500 bg-primary-50/60 dark:bg-primary-500/10' : 'border-input',
                errors.attachments && 'border-destructive',
              )}
            >
              <span className="flex items-center gap-2 text-muted-foreground">
                <Paperclip className="h-4 w-4" />
                Drop files here, or choose them — up to {MAX_ATTACHMENTS} files, {formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)} in total.
              </span>
              <button type="button" onClick={() => fileInput.current?.click()} className="btn-neutral btn-sm">
                <Upload className="h-3.5 w-3.5" /> Choose files
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
            <FieldMessages error={errors.attachments} />
            {files.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {files.map((f) => (
                  <li key={`${f.name}-${f.size}`} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-1.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-foreground" title={f.name}>{f.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setFiles(files.filter((x) => x !== f));
                          setErrors((x) => ({ ...x, attachments: undefined }));
                        }}
                        title={`Remove ${f.name}`}
                        aria-label={`Remove ${f.name}`}
                        className="ico-delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </li>
                ))}
                <li className="text-right text-xs text-muted-foreground">
                  {files.length} file{files.length === 1 ? '' : 's'} · {formatBytes(totalBytes)}
                </li>
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {Object.values(errors).some(Boolean)
              ? 'Fix the fields marked in red.'
              : to.length > 0
                ? `Goes to ${to.length + (channel === 'email' ? cc.length + bcc.length : 0)} recipient${to.length === 1 ? '' : 's'}${files.length ? ` with ${files.length} attachment${files.length === 1 ? '' : 's'}` : ''}.`
                : channel === 'whatsapp'
                  ? 'WhatsApp delivers free-form messages only to people who have written to the business number in the last 24 hours.'
                  : 'Each recipient receives the email from the configured company address.'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={reset} disabled={sending} className="btn-secondary">
              Clear
            </button>
            <button type="button" onClick={() => void send()} disabled={sending || Boolean(notReady)} className="btn-primary">
              <Send className="h-4 w-4" />
              {sending ? 'Sending…' : channel === 'email' ? 'Send email' : 'Send WhatsApp'}
            </button>
          </div>
        </div>
      </div>

      <DataTable<OutboundListItem>
        rows={rows}
        loading={loading}
        rowKey={(r) => r.id}
        title="Sent messages"
        searchPlaceholder="Search subject, message, recipient, sender, date..."
        emptyMessage={
          search || channelFilter || statusFilter
            ? 'No messages match these filters — clear them to see everything sent.'
            : 'Nothing has been sent from here yet — write the first message above.'
        }
        filters={
          <>
            <SearchableSelect
              size="sm"
              value={channelFilter}
              onChange={(v) => { setChannelFilter(v); setPage(1); }}
              options={CHANNEL_FILTER}
              emptyLabel="All Channels"
              placeholder="All Channels"
              aria-label="Channel"
            />
            <SearchableSelect
              size="sm"
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(1); }}
              options={STATUS_FILTER}
              emptyLabel="All Statuses"
              placeholder="All Statuses"
              aria-label="Status"
            />
          </>
        }
        columns={[
          { key: 'created_at', header: 'Sent', render: (r) => formatDateTime(r.created_at) },
          {
            key: 'channel',
            header: 'Channel',
            value: (r) => (r.channel === 'whatsapp' ? 'WhatsApp' : 'Email'),
            render: (r) => (
              <span className="inline-flex items-center gap-1.5">
                {r.channel === 'whatsapp' ? <MessageCircle className="h-4 w-4 text-emerald-500" /> : <Mail className="h-4 w-4 text-sky-500" />}
                {r.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
              </span>
            ),
          },
          {
            key: 'to_recipients',
            header: 'To',
            value: (r) => [...r.to_recipients, ...r.cc_recipients].join(', '),
            render: (r) => {
              const all = [...r.to_recipients, ...r.cc_recipients];
              return (
                <span className="block max-w-[16rem] truncate" title={all.join(', ')}>
                  {all[0] ?? '—'}
                  {all.length > 1 && <span className="text-muted-foreground"> +{all.length - 1}</span>}
                </span>
              );
            },
          },
          {
            key: 'subject',
            header: 'Message',
            render: (r) => (
              <span className="block min-w-0 max-w-xl">
                <span className="block truncate font-medium text-foreground" title={r.subject}>{r.subject || '—'}</span>
                <span className="block truncate text-xs text-muted-foreground" title={r.body_text}>{r.body_text}</span>
              </span>
            ),
          },
          {
            key: 'attachment_count',
            header: 'Files',
            align: 'right',
            render: (r) =>
              r.attachment_count > 0 ? (
                <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5 text-muted-foreground" />{r.attachment_count}</span>
              ) : (
                '—'
              ),
          },
          {
            key: 'status',
            header: 'Status',
            value: (r) => STATUS_LABEL[r.status] ?? r.status,
            render: (r) => <StatusBadge status={STATUS_LABEL[r.status] ?? r.status} title={r.error ?? undefined} />,
          },
          { key: 'sent_by_name', header: 'Sent by', render: (r) => r.sent_by_name ?? '—' },
        ]}
        actions={(r) => ({ view: () => setViewId(r.id) })}
        server={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
          search,
          onSearchChange: (q) => { setSearch(q); setPage(1); },
        }}
      />

      {viewId !== null && <OutboundDetailDialog id={viewId} onClose={() => setViewId(null)} />}
      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
