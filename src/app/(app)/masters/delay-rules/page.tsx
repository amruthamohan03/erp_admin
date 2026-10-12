'use client';

import { useMemo, useState } from 'react';
import { AlarmClock, Plus, Trash2, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import Toggle from '@/components/ui/Toggle';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { useFetchedData } from '@/lib/hooks/useFetchedData';
import { displayLabel } from '@/lib/statusTone';
import type { DelayRuleDetail } from '@/db/queries/delayRules';

// Masters → Delay Rules — where "late" is decided (§4.1).
//
// A rule is: start at this date, finish at that one, within this many days.
// Its sub-periods are the legs inside that span, each with its own allowance.
// Both drive the Delay Tracker AND the two Delay KPI screens, which is why
// this screen warns before it lets the last default go.

interface Payload {
  rules: DelayRuleDetail[];
  fields: { import: string[]; export: string[] };
}

type StageDraft = DelayRuleDetail['stages'][number];

/** `pre_alert_date` → `Pre Alert Date`, so a picker reads like a form label. */
function humanise(field: string): string {
  return field
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace(/\bDgda\b/u, 'DGDA')
    .replace(/\bDrc\b/u, 'DRC')
    .replace(/\bBp\b/u, 'BP')
    .replace(/\bPv\b/u, 'PV')
    .replace(/\bCeec\b/u, 'CEEC')
    .replace(/\bLmc\b/u, 'LMC')
    .replace(/\bT1\b/u, 'T1');
}

const BLANK_STAGE: StageDraft = {
  id: 0,
  stage_key: '',
  label: '',
  short_label: '',
  from_field: '',
  to_field: '',
  target_days: 3,
  priority: false,
  color: '#6366f1',
  icon: 'clock',
  sort_order: 0,
};

export default function DelayRulesPage() {
  const [editing, setEditing] = useState<DelayRuleDetail | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);
  // The shared hook, not a local effect: it derives `loading` rather than
  // setting it synchronously inside one, and carries the cancellation guard.
  const { data, loading, error, reload: load } = useFetchedData<Payload>('/api/v1/delay-rules');

  async function remove(rule: DelayRuleDetail): Promise<void> {
    if (!confirm(`Disable the delay rule "${rule.name}"? Files it measures will fall back to the module's default.`)) return;
    const res = await safeFetchJson(`/api/v1/delay-rules/${rule.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not disabled', message: res.message || 'This rule could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Disabled', message: `"${rule.name}" has been disabled.` });
    load();
  }

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <AlarmClock className="h-6 w-6" /> Delay Rules
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Where a process starts, where it finishes, and how long it may take. Drives the Delay
            Tracker and both Delay KPI screens.
          </p>
        </div>
      </div>

      <DataTable<DelayRuleDetail>
        rows={data?.rules ?? []}
        loading={loading}
        rowKey={(r) => r.id}
        searchPlaceholder="Search rule, module, date field..."
        tableId="delay-rules"
        autoColumns={false}
        emptyMessage="No delay rules yet — create one to start tracking deadlines."
        toolbar={
          <button type="button" className="btn-primary btn-sm" onClick={() => setEditing({ ...BLANK_RULE })}>
            <Plus className="h-4 w-4" /> New Rule
          </button>
        }
        columns={[
          { key: 'name', header: 'Rule', sortable: true, render: (r) => <strong>{r.name}</strong> },
          { key: 'module', header: 'Module', sortable: true, render: (r) => (r.module === 'import' ? 'Import' : 'Export') },
          {
            key: 'transport_letter',
            header: 'Applies To',
            render: (r) =>
              r.transport_letter ? (
                <StatusBadge status={`Transport ${r.transport_letter}`} tone="sky" />
              ) : (
                <StatusBadge status="Default" tone="slate" />
              ),
          },
          { key: 'start_field', header: 'Starts At', render: (r) => humanise(r.start_field) },
          { key: 'end_field', header: 'Completes At', render: (r) => humanise(r.end_field) },
          {
            key: 'target_days',
            header: 'Allowance',
            align: 'right',
            sortable: true,
            render: (r) => `${r.target_days} ${r.day_basis === 'working' ? 'w.' : 'cal.'} days`,
          },
          { key: 'stages', header: 'Sub-periods', align: 'right', value: (r) => r.stages.length, render: (r) => r.stages.length },
          {
            key: 'notify',
            header: 'Warns At',
            value: (r) => r.notify_days_before.join(','),
            render: (r) =>
              r.notify_days_before.length === 0 && !r.notify_overdue ? (
                <span className="text-xs text-muted-foreground">never</span>
              ) : (
                <span className="text-xs text-foreground">
                  {r.notify_days_before.map((n) => `${n}d`).join(', ')}
                  {r.notify_overdue ? (r.notify_days_before.length ? ' + overdue' : 'overdue') : ''}
                </span>
              ),
          },
          {
            key: 'display',
            header: 'Status',
            value: (r) => displayLabel(r.display),
            render: (r) => <StatusBadge status={displayLabel(r.display)} />,
          },
        ]}
        actions={(row) => ({
          edit: () => setEditing(row),
          remove: () => void remove(row),
        })}
      />

      {editing && data && (
        <RuleEditor
          rule={editing}
          fields={data.fields}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            setResult({ status: 'success', title: 'Saved', message: msg });
            load();
          }}
          onError={(msg) => setResult({ status: 'error', title: 'Not saved', message: msg })}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </div>
  );
}

const BLANK_RULE: DelayRuleDetail = {
  id: 0,
  module: 'import',
  rule_key: '',
  name: '',
  transport_letter: null,
  start_field: '',
  end_field: '',
  target_days: 21,
  day_basis: 'working',
  notify_days_before: [5, 3, 1],
  notify_overdue: true,
  display: 'Y',
  stages: [],
};

function RuleEditor({
  rule,
  fields,
  onClose,
  onSaved,
  onError,
}: {
  rule: DelayRuleDetail;
  fields: Payload['fields'];
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const isNew = rule.id === 0;
  const [draft, setDraft] = useState<DelayRuleDetail>(rule);
  const [saving, setSaving] = useState(false);

  const options = useMemo(
    () => fields[draft.module].map((f) => ({ value: f, label: humanise(f) })),
    [fields, draft.module],
  );

  const set = <K extends keyof DelayRuleDetail>(k: K, v: DelayRuleDetail[K]): void =>
    setDraft((d) => ({ ...d, [k]: v }));

  const setStage = (i: number, patch: Partial<StageDraft>): void =>
    setDraft((d) => ({ ...d, stages: d.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSaving(true);
    const body = {
      module: draft.module,
      rule_key: draft.rule_key || draft.name.toLowerCase().replace(/[^a-z0-9]+/gu, '_').replace(/^_|_$/gu, ''),
      name: draft.name,
      transport_letter: draft.transport_letter,
      start_field: draft.start_field,
      end_field: draft.end_field,
      target_days: draft.target_days,
      day_basis: draft.day_basis,
      notify_days_before: draft.notify_days_before,
      notify_overdue: draft.notify_overdue,
      stages: draft.stages.map((s, i) => ({ ...s, sort_order: i + 1 })),
    };
    const res = await safeFetchJson(isNew ? '/api/v1/delay-rules' : `/api/v1/delay-rules/${draft.id}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      onError(res.message || 'This rule could not be saved.');
      return;
    }
    onSaved(`"${draft.name}" has been saved.`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card flex max-h-[90vh] w-full max-w-4xl flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-semibold text-foreground">
            {isNew ? 'New Delay Rule' : `Edit — ${rule.name}`}
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="label required">Name</label>
                <input className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} required maxLength={150} />
              </div>
              <div>
                <label className="label required">Module</label>
                <SearchableSelect
                  value={draft.module}
                  onChange={(v) => setDraft((d) => ({ ...d, module: v as 'import' | 'export', start_field: '', end_field: '', stages: [] }))}
                  options={[{ value: 'import', label: 'Import' }, { value: 'export', label: 'Export' }]}
                  placeholder="Choose a module"
                  aria-label="Module"
                />
              </div>
              <div>
                <label className="label">Applies To</label>
                <SearchableSelect
                  value={draft.transport_letter ?? ''}
                  onChange={(v) => set('transport_letter', v || null)}
                  options={[
                    { value: 'R', label: 'Road (R)' },
                    { value: 'A', label: 'Air (A)' },
                    { value: 'W', label: 'Wagon (W)' },
                    { value: 'L', label: 'Lake (L)' },
                  ]}
                  emptyLabel="Every file (default rule)"
                  placeholder="Every file (default rule)"
                  aria-label="Transport mode"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className="label required">Process Starts At</label>
                <SearchableSelect
                  value={draft.start_field}
                  onChange={(v) => set('start_field', v)}
                  options={options}
                  placeholder="Choose the start date"
                  aria-label="Start date field"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label required">Process Completes At</label>
                <SearchableSelect
                  value={draft.end_field}
                  onChange={(v) => set('end_field', v)}
                  options={options}
                  placeholder="Choose the end date"
                  aria-label="End date field"
                />
              </div>
              <div>
                <label className="label required">Days Allowed</label>
                <input
                  type="number"
                  className="input"
                  value={draft.target_days}
                  onChange={(e) => set('target_days', Number(e.target.value))}
                  min={0}
                  max={3650}
                  required
                />
              </div>
              <div>
                <label className="label">Counted In</label>
                <SearchableSelect
                  value={draft.day_basis}
                  onChange={(v) => set('day_basis', v)}
                  options={[
                    { value: 'working', label: 'Working days' },
                    { value: 'calendar', label: 'Calendar days' },
                  ]}
                  placeholder="Working days"
                  aria-label="Day basis"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Working days skip Saturdays, Sundays and DRC holidays.
                </p>
              </div>
              <div className="lg:col-span-2">
                <label className="label">Warn When Days Remain</label>
                <input
                  className="input"
                  value={draft.notify_days_before.join(', ')}
                  onChange={(e) =>
                    set(
                      'notify_days_before',
                      e.target.value
                        .split(',')
                        .map((p) => Number(p.trim()))
                        .filter((n) => Number.isInteger(n) && n >= 0),
                    )
                  }
                  placeholder="5, 3, 1"
                  aria-label="Notification marks"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  A notification at each mark, once per file. Leave blank for none.
                </p>
              </div>
            </div>

            <Toggle
              checked={draft.notify_overdue}
              onChange={(v) => set('notify_overdue', v)}
              label="Also notify once the deadline has passed"
            />

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Sub-periods</h3>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => setDraft((d) => ({ ...d, stages: [...d.stages, { ...BLANK_STAGE, sort_order: d.stages.length + 1 }] }))}
                >
                  <Plus className="h-4 w-4" /> Add Sub-period
                </button>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Legs inside the process, each with its own allowance. They need not join up —
                two may overlap deliberately, as &ldquo;DGDA In → Liquidation&rdquo; sits inside
                &ldquo;DRC Entry → Delivered&rdquo;.
              </p>

              {draft.stages.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No sub-periods. The rule still measures the whole process from start to finish.
                </p>
              ) : (
                <div className="space-y-2">
                  {draft.stages.map((s, i) => (
                    <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-12">
                      <div className="sm:col-span-3">
                        <label className="label required">Name</label>
                        <input className="input" value={s.label} onChange={(e) => setStage(i, { label: e.target.value })} required maxLength={150} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label required">Short</label>
                        <input className="input" value={s.short_label} onChange={(e) => setStage(i, { short_label: e.target.value })} required maxLength={40} />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="label required">From</label>
                        <SearchableSelect value={s.from_field} onChange={(v) => setStage(i, { from_field: v })} options={options} placeholder="Start date" aria-label={`Sub-period ${i + 1} start`} />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="label required">To</label>
                        <SearchableSelect value={s.to_field} onChange={(v) => setStage(i, { to_field: v })} options={options} placeholder="End date" aria-label={`Sub-period ${i + 1} end`} />
                      </div>
                      <div className="sm:col-span-1">
                        <label className="label required">Days</label>
                        <input type="number" className="input" value={s.target_days} onChange={(e) => setStage(i, { target_days: Number(e.target.value) })} min={0} max={3650} required />
                      </div>
                      <div className="flex items-center gap-3 sm:col-span-12">
                        <Toggle size="sm" checked={s.priority} onChange={(v) => setStage(i, { priority: v })} label="Key leg" />
                        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          Colour
                          <input
                            type="color"
                            className="h-7 w-10 cursor-pointer rounded border border-input bg-card"
                            value={s.color}
                            onChange={(e) => setStage(i, { color: e.target.value })}
                            aria-label={`Sub-period ${i + 1} colour`}
                          />
                        </label>
                        <button
                          type="button"
                          className="ico-delete ms-auto"
                          title="Remove this sub-period"
                          onClick={() => setDraft((d) => ({ ...d, stages: d.stages.filter((_, j) => j !== i) }))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
