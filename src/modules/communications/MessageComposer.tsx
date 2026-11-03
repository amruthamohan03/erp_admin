'use client';

// The email / WhatsApp composer — recipients, subject, a formatted body and
// attachments. One component behind both the Email & WhatsApp screen and the
// mail / WhatsApp buttons on the licence … invoice lists (§4.10).
//
// It runs the same `sendOutboundSchema` and `attachmentError` the route does,
// so a problem is named before the upload rather than after it (§4.23); the
// route checks it all again.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Info, Mail, MessageCircle, Paperclip, Send, Trash2, Upload, X } from 'lucide-react';
import RichTextEditor from '@/components/ui/RichTextEditor';
import FieldMessages from '@/components/ui/FieldMessages';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import RecipientInput from '@/modules/communications/RecipientInput';
import { safeFetchJson } from '@/lib/safeFetch';
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
import type { DirectoryEntry } from '@/db/queries/outboundMessages';
import type { OutboundResult } from '@/db/schema';

const CHANNELS: Array<{ value: OutboundChannel; label: string; icon: typeof Mail }> = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
];

type FieldErrors = Partial<Record<'to' | 'cc' | 'bcc' | 'subject' | 'message' | 'attachments', string>>;

export interface ComposerInitial {
  channel: OutboundChannel;
  to?: string[];
  cc?: string[];
  subject?: string;
  /** HTML. */
  message?: string;
}

export interface MessageComposerProps {
  title: ReactNode;
  initial?: ComposerInitial;
  /** Opened on one channel by a row action — no switching to the other. */
  lockChannel?: boolean;
  /** The stage record the message is about, recorded on the sent message. */
  link?: { entity_type: string; entity_id: number; template_key: string | null };
  /** Whether each channel is set up on the server; null while unknown. */
  configured: Record<OutboundChannel, boolean> | null;
  /** Things the operator should know before sending, e.g. a client with no email. */
  notes?: string[];
  /** After any attempt the server recorded — sent, partly sent, or refused. */
  onSent?: () => void;
  /** Given in a dialog: the header gets a close button and the footer a Cancel (§4.21). */
  onClose?: () => void;
  className?: string;
}

export default function MessageComposer({
  title,
  initial,
  lockChannel = false,
  link,
  configured,
  notes = [],
  onSent,
  onClose,
  className,
}: MessageComposerProps) {
  const [channel, setChannel] = useState<OutboundChannel>(initial?.channel ?? 'email');
  // Kept apart per channel — switching to WhatsApp must not throw away the
  // email addresses already chosen, nor try to dial them.
  const [emailTo, setEmailTo] = useState<string[]>(initial?.channel === 'email' ? (initial.to ?? []) : []);
  const [phoneTo, setPhoneTo] = useState<string[]>(initial?.channel === 'whatsapp' ? (initial.to ?? []) : []);
  const [cc, setCc] = useState<string[]>(initial?.cc ?? []);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCopies, setShowCopies] = useState((initial?.cc?.length ?? 0) > 0);
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [bodyHtml, setBodyHtml] = useState(initial?.message ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  // In a dialog, OK on a successful send is what closes it (§4.22).
  const [closeOnDismiss, setCloseOnDismiss] = useState(false);
  const [directory, setDirectory] = useState<{ emails: DirectoryEntry[]; phones: DirectoryEntry[] }>({ emails: [], phones: [] });

  const to = channel === 'email' ? emailTo : phoneTo;
  const setTo = channel === 'email' ? setEmailTo : setPhoneTo;

  useEffect(() => {
    void safeFetchJson<{ emails: DirectoryEntry[]; phones: DirectoryEntry[] }>('/api/v1/outbound-messages/recipients').then(
      (res) => {
        if (res.ok) setDirectory(res.data);
      },
    );
  }, []);

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
    setCloseOnDismiss(false);
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
    if (link) {
      body.set('entity_type', link.entity_type);
      body.set('entity_id', String(link.entity_id));
      if (link.template_key) body.set('template_key', link.template_key);
    }
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
      // A provider refusal is still recorded — let the caller show it in the log.
      onSent?.();
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
    setCloseOnDismiss(Boolean(onClose));
    reset();
    onSent?.();
  };

  const notReady = configured && !configured[channel];

  return (
    <div className={cn('card overflow-hidden', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-gradient px-4 py-3 text-white">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Send className="h-4 w-4 shrink-0" /> <span className="truncate">{title}</span>
        </h2>
        <div className="flex items-center gap-2">
          {!lockChannel && (
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
          )}
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-white/90 hover:bg-white/15">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {notReady && (
        <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{CHANNEL_NOT_CONFIGURED[channel]}</span>
        </div>
      )}
      {notes.length > 0 && (
        <div className="flex items-start gap-2 border-b border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notes.join(' ')}</span>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4">
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
          {onClose ? (
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
          ) : (
            <button type="button" onClick={reset} disabled={sending} className="btn-secondary">
              Clear
            </button>
          )}
          <button type="button" onClick={() => void send()} disabled={sending || Boolean(notReady)} className="btn-primary">
            <Send className="h-4 w-4" />
            {sending ? 'Sending…' : channel === 'email' ? 'Send email' : 'Send WhatsApp'}
          </button>
        </div>
      </div>

      <ResultDialog
        result={result}
        onDismiss={() => {
          setResult(null);
          if (closeOnDismiss) onClose?.();
        }}
      />
    </div>
  );
}
