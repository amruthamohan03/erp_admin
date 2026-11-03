'use client';

// Masters → Communication Templates: what the client is told at each stage from
// licence to invoice — by email and by WhatsApp — when it is sent on its own,
// and the draft behind each list's mail / WhatsApp buttons. The code only says
// "an import file was created"; who hears it and in what words is here (§4.1).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import Toggle from '@/components/ui/Toggle';
import RichTextEditor from '@/components/ui/RichTextEditor';
import FieldMessages from '@/components/ui/FieldMessages';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { summarizeZodError } from '@/lib/validation/messages';
import { displayLabel } from '@/lib/statusTone';
import { CHANNEL_NOT_CONFIGURED } from '@/lib/messaging/setup';
import {
  COMMUNICATION_RECIPIENTS,
  COMMUNICATION_STAGES,
  COMMUNICATION_TRIGGERS,
  RECIPIENT_LABEL,
  TRIGGER_LABEL,
  communicationTemplateSchema,
  type CommunicationRecipient,
  type CommunicationTrigger,
} from '@/schemas/communicationTemplates';
import type { CommunicationTemplateItem } from '@/db/queries/communicationTemplates';
import type { PageFetchResponse } from '@/types';

type Draft = Omit<CommunicationTemplateItem, 'id' | 'stage'>;
type Errors = Partial<Record<keyof Draft, string>>;

const EMPTY: Draft = {
  template_key: '',
  name: '',
  page_slug: 'import',
  trigger: 'field_change',
  trigger_key: '',
  trigger_value: '',
  auto_email: true,
  auto_whatsapp: false,
  recipient: 'client',
  extra_to: '',
  cc: '',
  email_subject: '',
  email_body: '<p>Dear {client_name},</p><p></p><p>Kind regards,<br>{company}</p>',
  whatsapp_body: 'Dear {client_code}, ',
  display: 'Y',
};

const STAGE_OPTIONS = COMMUNICATION_STAGES.map((s) => ({ value: s.slug, label: s.label }));
const TRIGGER_OPTIONS = COMMUNICATION_TRIGGERS.map((t) => ({ value: t, label: TRIGGER_LABEL[t] }));
const RECIPIENT_OPTIONS = COMMUNICATION_RECIPIENTS.map((r) => ({ value: r, label: RECIPIENT_LABEL[r] }));
const EXTRA_TOKENS = ['client_code', 'client_name', 'company', 'today', 'actor'];

export default function CommunicationTemplatesPage() {
  const [rows, setRows] = useState<CommunicationTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<{ email: boolean; provider: string | null; whatsapp: boolean } | null>(null);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [fields, setFields] = useState<Array<{ value: string; label: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CommunicationTemplateItem | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await safeFetchJson<CommunicationTemplateItem[]>('/api/v1/communication-templates');
    if (res.ok) {
      setRows(res.data);
      setSetup({
        email: res.meta?.email_configured === true,
        provider: typeof res.meta?.email_provider === 'string' ? res.meta.email_provider : null,
        whatsapp: res.meta?.whatsapp_configured === true,
      });
    } else {
      setRows([]);
      setResult({ status: 'error', title: 'Could not load templates', message: res.message });
    }
    setLoading(false);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // The chosen stage's fields — for the Field picker and the token list.
  useEffect(() => {
    if (editingId === null) return;
    void safeFetchJson<PageFetchResponse>(`/api/v1/pages/${draft.page_slug}`).then((res) => {
      if (!res.ok) {
        setFields([]);
        return;
      }
      const seen = new Set<string>();
      const list: Array<{ value: string; label: string }> = [];
      for (const acc of res.data.page.accordions) {
        for (const f of acc.fields) {
          if (seen.has(f.name)) continue;
          seen.add(f.name);
          list.push({ value: f.name, label: `${f.label} (${f.name})` });
        }
      }
      setFields(list);
    });
  }, [editingId, draft.page_slug]);

  const open = (row: CommunicationTemplateItem | null): void => {
    setErrors({});
    if (row) {
      const { id, ...rest } = row;
      setDraft({ ...EMPTY, ...rest });
      setEditingId(id);
    } else {
      setDraft(EMPTY);
      setEditingId('new');
    }
  };
  const close = (): void => setEditingId(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]): void => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const save = async (): Promise<void> => {
    const parsed = communicationTemplateSchema.safeParse(draft);
    if (!parsed.success) {
      const summary = summarizeZodError(parsed.error);
      const next: Errors = {};
      for (const [k, m] of Object.entries(summary.fields)) next[k as keyof Draft] = m[0];
      setErrors(next);
      setResult({ status: 'error', title: 'Not saved', message: summary.message });
      return;
    }
    setSaving(true);
    const isNew = editingId === 'new';
    const res = await safeFetchJson<{ id: number }>(
      isNew ? '/api/v1/communication-templates' : `/api/v1/communication-templates/${editingId}`,
      { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) },
    );
    setSaving(false);
    if (!res.ok) {
      if (res.field) setErrors({ [res.field]: res.fieldMessages?.[res.field]?.[0] ?? res.message });
      setResult({ status: 'error', title: 'Not saved', message: res.message });
      return;
    }
    setResult({
      status: 'success',
      title: isNew ? 'Created' : 'Saved',
      message: `The template "${draft.name}" has been ${isNew ? 'created' : 'updated'}.`,
    });
    close();
    void load();
  };

  const remove = async (row: CommunicationTemplateItem): Promise<void> => {
    const res = await safeFetchJson(`/api/v1/communication-templates/${row.id}`, { method: 'DELETE' });
    setConfirmDelete(null);
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: res.message });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: `The template "${row.name}" has been disabled — nothing more is sent from it.` });
    void load();
  };

  const tokens = useMemo(() => [...fields.map((f) => f.value), ...EXTRA_TOKENS], [fields]);
  const isEvent = draft.trigger === 'event';
  const isField = draft.trigger === 'field_change';
  const isManual = draft.trigger === 'manual';

  return (
    <>
      <h1 className="mb-4 text-xl font-bold text-foreground">Communication Templates</h1>

      {setup && (!setup.email || !setup.whatsapp) && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {!setup.email && <>{CHANNEL_NOT_CONFIGURED.email} Until then no email is sent, automatically or by hand. </>}
            {!setup.whatsapp && <>{CHANNEL_NOT_CONFIGURED.whatsapp}</>}
          </span>
        </div>
      )}
      {setup?.email && (
        <p className="mb-3 text-sm text-muted-foreground">
          Email is sent through {setup.provider === 'outlook' ? 'Outlook (Microsoft 365)' : 'the SMTP server'}. Every message — automatic or by hand — is
          logged under Communication → Email &amp; WhatsApp.
        </p>
      )}

      <DataTable<CommunicationTemplateItem>
        rows={rows}
        loading={loading}
        rowKey={(r) => r.id}
        title="Templates"
        searchPlaceholder="Search stage, name, key, subject..."
        emptyMessage="No communication templates yet — create the first one."
        columns={[
          { key: 'stage', header: 'Stage', sortable: true },
          { key: 'name', header: 'Name', sortable: true, className: 'font-medium' },
          {
            key: 'trigger',
            header: 'Sent when',
            value: (r) => `${TRIGGER_LABEL[r.trigger as CommunicationTrigger] ?? r.trigger} ${r.trigger_key} ${r.trigger_value}`,
            render: (r) => (
              <span className="block max-w-xs truncate" title={[r.trigger_key, r.trigger_value].filter(Boolean).join(' = ')}>
                {TRIGGER_LABEL[r.trigger as CommunicationTrigger] ?? r.trigger}
                {r.trigger_key && <span className="font-mono text-xs text-muted-foreground"> · {r.trigger_key}</span>}
                {r.trigger_value && <span className="text-xs text-muted-foreground"> = {r.trigger_value}</span>}
              </span>
            ),
          },
          {
            key: 'auto_email',
            header: 'Automatic',
            value: (r) => [r.auto_email && 'Email', r.auto_whatsapp && 'WhatsApp'].filter(Boolean).join(', ') || 'No',
            render: (r) => [r.auto_email && 'Email', r.auto_whatsapp && 'WhatsApp'].filter(Boolean).join(' + ') || 'By hand only',
          },
          { key: 'recipient', header: 'Send to', value: (r) => RECIPIENT_LABEL[r.recipient], render: (r) => RECIPIENT_LABEL[r.recipient] },
          { key: 'email_subject', header: 'Subject', render: (r) => <span className="block max-w-xs truncate" title={r.email_subject}>{r.email_subject}</span> },
          { key: 'display', header: 'Status', value: (r) => displayLabel(r.display), render: (r) => <StatusBadge status={displayLabel(r.display)} /> },
        ]}
        actions={(r) => ({
          edit: () => open(r),
          remove: r.display === 'Y' ? () => setConfirmDelete(r) : undefined,
        })}
        toolbar={
          <button type="button" onClick={() => open(null)} className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Template
          </button>
        }
      />

      {editingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="ct-title">
          <div className="card flex max-h-[90vh] w-full max-w-3xl flex-col">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 id="ct-title" className="font-semibold text-foreground">
                {editingId === 'new' ? 'New template' : 'Edit template'}
              </h2>
              <button type="button" onClick={close} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 overflow-y-auto px-5 py-4 md:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="ct-name" className="label required">Name</label>
                <input id="ct-name" className="input" value={draft.name} maxLength={150} required
                  aria-invalid={errors.name ? true : undefined} onChange={(e) => set('name', e.target.value)} />
                <FieldMessages error={errors.name} />
              </div>
              <div className="min-w-0">
                <label htmlFor="ct-key" className="label required">Key</label>
                <input id="ct-key" className="input font-mono" value={draft.template_key} maxLength={100} required
                  // The key names the template on every message already sent from it.
                  readOnly={editingId !== 'new'} placeholder="import.cleared"
                  aria-invalid={errors.template_key ? true : undefined} onChange={(e) => set('template_key', e.target.value)} />
                <FieldMessages error={errors.template_key} />
              </div>

              <div className="min-w-0">
                <label className="label required">Stage</label>
                <SearchableSelect value={draft.page_slug} onChange={(v) => { set('page_slug', v); set('trigger_key', ''); }}
                  options={STAGE_OPTIONS} placeholder="Choose a stage" aria-label="Stage" invalid={Boolean(errors.page_slug)} />
                <FieldMessages error={errors.page_slug} />
              </div>
              <div className="min-w-0">
                <label className="label required">Sent when</label>
                <SearchableSelect value={draft.trigger} onChange={(v) => set('trigger', v as CommunicationTrigger)}
                  options={TRIGGER_OPTIONS} aria-label="Sent when" invalid={Boolean(errors.trigger)} />
                <FieldMessages error={errors.trigger} />
              </div>

              {isField && (
                <>
                  <div className="min-w-0">
                    <label className="label required">Field</label>
                    <SearchableSelect value={draft.trigger_key} onChange={(v) => set('trigger_key', v)}
                      options={fields} placeholder="Choose the field to watch" aria-label="Field" invalid={Boolean(errors.trigger_key)} />
                    <FieldMessages error={errors.trigger_key} />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="ct-value" className="label">Only when the new value is</label>
                    <input id="ct-value" className="input" value={draft.trigger_value} maxLength={200}
                      placeholder="Any change — or e.g. CLEARING COMPLETED, CLEARED WITH IR"
                      aria-invalid={errors.trigger_value ? true : undefined} onChange={(e) => set('trigger_value', e.target.value)} />
                    <FieldMessages error={errors.trigger_value} />
                  </div>
                </>
              )}
              {isEvent && (
                <div className="min-w-0 md:col-span-2">
                  <label htmlFor="ct-event" className="label required">Event</label>
                  <input id="ct-event" className="input font-mono" value={draft.trigger_key} maxLength={100}
                    placeholder="import_invoice.validated" aria-invalid={errors.trigger_key ? true : undefined}
                    onChange={(e) => set('trigger_key', e.target.value)} />
                  <FieldMessages error={errors.trigger_key} />
                  <p className="mt-1 text-xs text-muted-foreground">The key of a system event, as listed under Masters → Notification Events.</p>
                </div>
              )}

              <div className="min-w-0">
                <label className="label required">Send to</label>
                <SearchableSelect value={draft.recipient} onChange={(v) => set('recipient', v as CommunicationRecipient)}
                  options={RECIPIENT_OPTIONS} aria-label="Send to" />
              </div>
              <div className="min-w-0">
                <label htmlFor="ct-extra" className="label">Always send to (email)</label>
                <input id="ct-extra" className="input" value={draft.extra_to} placeholder="ops@company.cd, …"
                  title={draft.extra_to} aria-invalid={errors.extra_to ? true : undefined} onChange={(e) => set('extra_to', e.target.value)} />
                <FieldMessages error={errors.extra_to} />
              </div>
              <div className="min-w-0 md:col-span-2">
                <label htmlFor="ct-cc" className="label">Cc (email)</label>
                <input id="ct-cc" className="input" value={draft.cc} placeholder="manager@company.cd, …" title={draft.cc}
                  aria-invalid={errors.cc ? true : undefined} onChange={(e) => set('cc', e.target.value)} />
                <FieldMessages error={errors.cc} />
              </div>

              <div className="flex flex-wrap gap-6 md:col-span-2">
                <Toggle checked={draft.auto_email} onChange={(v) => set('auto_email', v)} disabled={isManual} label="Send email automatically" />
                <Toggle checked={draft.auto_whatsapp} onChange={(v) => set('auto_whatsapp', v)} disabled={isManual} label="Send WhatsApp automatically" />
                <Toggle checked={draft.display === 'Y'} onChange={(v) => set('display', v ? 'Y' : 'N')} label="Active" />
              </div>
              {draft.auto_whatsapp && (
                <p className="text-xs text-amber-700 dark:text-amber-300 md:col-span-2">
                  WhatsApp only delivers a free-form message to a number that wrote to the business in the last 24 hours. Messages
                  outside that window are refused and show as failed in the log.
                </p>
              )}

              <div className="min-w-0 md:col-span-2">
                <label htmlFor="ct-subject" className="label required">Email Subject</label>
                <input id="ct-subject" className="input" value={draft.email_subject} maxLength={200} required
                  aria-invalid={errors.email_subject ? true : undefined} onChange={(e) => set('email_subject', e.target.value)} />
                <FieldMessages error={errors.email_subject} />
              </div>
              <div className="min-w-0 md:col-span-2">
                <label htmlFor="ct-body" className="label required">Email Body</label>
                <RichTextEditor key={String(editingId)} id="ct-body" value={draft.email_body} onChange={(html) => set('email_body', html)}
                  invalid={Boolean(errors.email_body)} aria-label="Email Body" minHeight="min-h-[160px]" />
                <FieldMessages error={errors.email_body} />
              </div>
              <div className="min-w-0 md:col-span-2">
                <label htmlFor="ct-wa" className="label required">WhatsApp Message</label>
                <textarea id="ct-wa" className="input min-h-[80px]" value={draft.whatsapp_body} maxLength={4096} required
                  aria-invalid={errors.whatsapp_body ? true : undefined} onChange={(e) => set('whatsapp_body', e.target.value)} />
                <FieldMessages error={errors.whatsapp_body} />
              </div>
              <p className="text-xs text-muted-foreground md:col-span-2">
                Tokens: {tokens.map((t) => `{${t}}`).join(' ')}. A field is filled the way its form shows it — a status by its name, a date as DD-MM-YYYY.
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button type="button" onClick={close} className="btn-secondary">Cancel</button>
              <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Disable template"
        tone="danger"
        confirmLabel="Disable"
        onConfirm={() => confirmDelete && void remove(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      >
        Disable &ldquo;{confirmDelete?.name}&rdquo;? Nothing more is sent from it, automatically or as a draft. It can be switched back on
        by editing it.
      </ConfirmDialog>
      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
