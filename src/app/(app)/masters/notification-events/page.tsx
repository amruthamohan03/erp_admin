'use client';

// Masters → Notification Events: for each status change the system announces
// (payment approved at a stage, rejected, invoice validated, fiche verified,
// file cancelled, …) — which roles hear about it, whether the record's creator
// is told, and the words used. The code only raises the event key (§4.1).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import MultiSelect from '@/components/ui/MultiSelect';
import SearchableSelect from '@/components/ui/SearchableSelect';
import Toggle from '@/components/ui/Toggle';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { fetchMasterOptions } from '@/lib/selectOptions';
import { renderTemplate, templateTokens } from '@/lib/notificationTemplate';
import StatusBadge from '@/components/ui/StatusBadge';
import { displayLabel } from '@/lib/statusTone';

interface EventRow {
  id: number;
  event_key: string;
  module: string;
  name: string;
  title_template: string;
  message_template: string;
  link_template: string | null;
  notify_creator: boolean;
  priority: 'normal' | 'high';
  display: 'Y' | 'N';
  role_ids: number[];
  role_names: string | null;
}

interface Draft {
  name: string;
  title_template: string;
  message_template: string;
  link_template: string;
  notify_creator: boolean;
  priority: string;
  active: boolean;
  role_ids: string[];
}

const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

/** Stand-in values so the preview reads like a real notification. */
const SAMPLE = {
  actor: 'Asha K.',
  actor_role: 'Finance Head',
  ref: '#1042',
  stage: 'Finance',
  reason: 'Missing supporting invoice',
  amount: '12,500.00',
  currency: 'USD',
  beneficiary: 'SNCC',
  requestee: 'J. Mbuyi',
  mca_ref: 'NMI-IDCOR26-0001',
  client: 'NMI',
  kind: 'Import',
  date: '19-09-2026',
  state: 'VERIFIED',
};

export default function NotificationEventsPage() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<{ value: string; label: string }[]>([]);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await safeFetchJson<EventRow[]>('/api/v1/notification-events');
    setRows(res.ok ? res.data : []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    void fetchMasterOptions('roles', 'role_name').then((o) => setRoles(o.map((r) => ({ value: String(r.id), label: r.label }))));
  }, [load]);

  const edit = (r: EventRow): void => {
    setEditing(r);
    setInvalid(null);
    setDraft({
      name: r.name,
      title_template: r.title_template,
      message_template: r.message_template,
      link_template: r.link_template ?? '',
      notify_creator: r.notify_creator,
      priority: r.priority,
      active: r.display === 'Y',
      role_ids: r.role_ids.map(String),
    });
  };
  const close = (): void => {
    setEditing(null);
    setDraft(null);
  };

  const tokens = useMemo(
    () => (draft ? [...new Set([...templateTokens(draft.title_template), ...templateTokens(draft.message_template)])] : []),
    [draft],
  );

  const save = async (): Promise<void> => {
    if (!editing || !draft) return;
    setSaving(true);
    const res = await safeFetchJson(`/api/v1/notification-events/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: draft.name,
        title_template: draft.title_template,
        message_template: draft.message_template,
        link_template: draft.link_template,
        notify_creator: draft.notify_creator,
        priority: draft.priority,
        display: draft.active ? 'Y' : 'N',
        role_ids: draft.role_ids.map(Number),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setInvalid(res.field ?? null);
      setResult({ status: 'error', title: 'Not saved', message: res.message || 'The event could not be saved.' });
      return;
    }
    setResult({ status: 'success', title: 'Saved', message: `"${draft.name}" has been updated.` });
    close();
    void load();
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]): void => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <>
      <h1 className="mb-4 text-xl font-bold text-foreground">Notification Events</h1>

      <DataTable<EventRow>
        rows={rows}
        loading={loading}
        rowKey={(r) => r.id}
        title="Events"
        searchPlaceholder="Search module, event, roles, wording..."
        emptyMessage="No notification events are configured."
        columns={[
          { key: 'module', header: 'Module', sortable: true },
          { key: 'name', header: 'Event', sortable: true, className: 'font-medium' },
          { key: 'event_key', header: 'Key', className: 'font-mono text-xs' },
          {
            key: 'role_names',
            header: 'Roles told',
            render: (r) => <span className="block max-w-xs truncate" title={r.role_names ?? ''}>{r.role_names ?? '—'}</span>,
          },
          { key: 'notify_creator', header: 'Creator told', value: (r) => (r.notify_creator ? 'Yes' : 'No'), render: (r) => (r.notify_creator ? 'Yes' : 'No') },
          { key: 'priority', header: 'Priority', render: (r) => (r.priority === 'high' ? 'High' : 'Normal') },
          { key: 'display', header: 'Active', value: (r) => displayLabel(r.display), render: (r) => <StatusBadge status={displayLabel(r.display)} /> },
        ]}
        actions={(r) => ({ edit: () => edit(r) })}
      />

      {editing && draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="event-title">
          <div className="card flex max-h-[90vh] w-full max-w-2xl flex-col">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 id="event-title" className="font-semibold text-foreground">
                Edit event <span className="font-mono text-sm text-muted-foreground">{editing.event_key}</span>
              </h2>
              <button type="button" onClick={close} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 overflow-y-auto px-5 py-4 md:grid-cols-2">
              <div className="min-w-0 md:col-span-2">
                <label htmlFor="ev-name" className="label required">Name</label>
                <input id="ev-name" className="input" value={draft.name} maxLength={150} required aria-invalid={invalid === 'name' || undefined}
                  onChange={(e) => set('name', e.target.value)} />
              </div>
              <div className="min-w-0 md:col-span-2">
                <label className="label">Roles told</label>
                <MultiSelect values={draft.role_ids} onChange={(v) => set('role_ids', v)} options={roles}
                  placeholder="No role — only the creator, if ticked" noun="roles" aria-label="Roles told" />
              </div>
              <div className="min-w-0 md:col-span-2">
                <label htmlFor="ev-title" className="label required">Title</label>
                <input id="ev-title" className="input" value={draft.title_template} maxLength={200} required
                  aria-invalid={invalid === 'title_template' || undefined} onChange={(e) => set('title_template', e.target.value)} />
              </div>
              <div className="min-w-0 md:col-span-2">
                <label htmlFor="ev-message" className="label required">Message</label>
                <textarea id="ev-message" className="input min-h-[90px]" value={draft.message_template} maxLength={2000} required
                  aria-invalid={invalid === 'message_template' || undefined} onChange={(e) => set('message_template', e.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Tokens in use: {tokens.length > 0 ? tokens.map((t) => `{${t}}`).join(' ') : 'none'}. {'{actor}'} and {'{actor_role}'} are always available.
                </p>
              </div>
              <div className="min-w-0">
                <label htmlFor="ev-link" className="label">Opens</label>
                <input id="ev-link" className="input" value={draft.link_template} maxLength={300} placeholder="/payments"
                  aria-invalid={invalid === 'link_template' || undefined} onChange={(e) => set('link_template', e.target.value)} />
              </div>
              <div className="min-w-0">
                <label className="label required">Priority</label>
                <SearchableSelect value={draft.priority} onChange={(v) => set('priority', v)} options={PRIORITY_OPTIONS} aria-label="Priority" />
              </div>
              <div className="flex flex-wrap gap-6 md:col-span-2">
                <Toggle checked={draft.notify_creator} onChange={(v) => set('notify_creator', v)} label="Also tell the record's creator" />
                <Toggle checked={draft.active} onChange={(v) => set('active', v)} label="Active" />
              </div>
              <div className="rounded-md border border-border bg-muted/50 p-3 md:col-span-2">
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Preview (sample values)</p>
                <p className="text-sm font-semibold text-foreground">{renderTemplate(draft.title_template, SAMPLE)}</p>
                <p className="whitespace-pre-wrap text-sm text-foreground">{renderTemplate(draft.message_template, SAMPLE)}</p>
              </div>
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

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
