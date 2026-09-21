'use client';

// Developer Options → Transaction Pages → (page) → Conditions.
//
// Make fields appear, disappear, become required or read-only depending on
// what another field holds — "on a licence, show Fuel Density only when Type of
// Goods is FUEL". Each rule is stored in the target field's `conditions`, which
// the form runtime already applies both on screen and when the record is saved
// (a hidden field is not written, a conditionally required one is enforced).
//
// The builder covers one condition per rule — the case operators need. A
// compound rule written by a migration (all / any / not) is still listed in
// plain English and can be removed here; it just is not re-built by this form.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Lock, Plus, Asterisk, Trash2, Wand2 } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import MultiSelect from '@/components/ui/MultiSelect';
import Toggle from '@/components/ui/Toggle';
import SearchableSelect from '@/components/ui/SearchableSelect';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { fetchMasterOptions } from '@/lib/selectOptions';
import { formatDate } from '@/lib/formatDate';
import type { FieldConditions, Predicate, Scalar } from '@/lib/pages/conditions';
import {
  EFFECT_KEY,
  OPERATOR_LABELS,
  RULE_EFFECTS,
  buildLeaf,
  describePredicate,
  operatorNeedsValue,
  operatorTakesList,
  operatorsFor,
  predicateForEffect,
  rulesOf,
  type DescribeContext,
  type RuleEffect,
  type RuleOperator,
} from '@/lib/pages/conditionRules';

interface ConditionField {
  id: number;
  name: string;
  label: string;
  field_type: string;
  accordion_id: number;
  accordion_title: string;
  options_source: string | null;
  options_label_field: string | null;
  options_static: { value: string; label: string }[] | null;
  conditions: FieldConditions | null;
}

interface RuleRow {
  key: string;
  field_id: number;
  field_label: string;
  accordion_title: string;
  rule_key: 'visibleWhen' | 'requiredWhen' | 'readonlyWhen';
  effect: RuleEffect;
  when: string;
}

type OptionMap = Map<string, { value: string; label: string }[]>;

const EFFECT_STYLE: Record<RuleEffect, { icon: typeof Eye; label: string; cls: string }> = {
  show: { icon: Eye, label: 'Show only when', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300' },
  hide: { icon: EyeOff, label: 'Hide when', cls: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200' },
  require: { icon: Asterisk, label: 'Required when', cls: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300' },
  readonly: { icon: Lock, label: 'Read-only when', cls: 'border-border bg-muted text-foreground' },
};

/** Field types a rule can read a value from. A grid or a file has no single value. */
const CONTROLLING_TYPES = new Set(['text', 'textarea', 'email', 'tel', 'number', 'date', 'select']);

export default function ConditionsTab({ pageId }: { pageId: number }) {
  const [fields, setFields] = useState<ConditionField[]>([]);
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<OptionMap>(new Map());

  // The rule being built.
  const [controlling, setControlling] = useState('');
  const [operator, setOperator] = useState<RuleOperator>('eq');
  const [values, setValues] = useState<string[]>([]);
  const [effect, setEffect] = useState<RuleEffect>('show');
  const [targets, setTargets] = useState<string[]>([]);
  // Many fields already carry a rule of the same kind (Supplier is hidden for
  // some licence kinds). Keeping it means BOTH must hold, instead of the new
  // rule silently replacing the old one.
  const [keepExisting, setKeepExisting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);
  // The Value dropdown's choices for the controlling field — its own options for
  // a dropdown field, or the values already recorded for any other field.
  const [valueOptions, setValueOptions] = useState<{ value: string; label: string }[]>([]);
  const [loadingValues, setLoadingValues] = useState(false);
  const [valuesError, setValuesError] = useState<string | null>(null);

  const [removing, setRemoving] = useState<RuleRow | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await safeFetchJson<ConditionField[]>(`/api/v1/master-page-conditions?page_id=${pageId}`);
    setFields(res.ok ? res.data : []);
    setLoading(false);
  }, [pageId]);
  useEffect(() => {
    void load();
  }, [load]);

  // Options for every select on the page, so values read as labels ("FUEL"), not ids.
  useEffect(() => {
    let live = true;
    void (async () => {
      const map: OptionMap = new Map();
      for (const f of fields) {
        if (f.field_type !== 'select') continue;
        if (f.options_static && f.options_static.length > 0) {
          map.set(f.name, f.options_static.map((o) => ({ value: String(o.value), label: o.label })));
        } else if (f.options_source) {
          const rows = await fetchMasterOptions(f.options_source, f.options_label_field ?? 'name');
          map.set(f.name, rows.map((r) => ({ value: String(r.id), label: r.label })));
        }
      }
      if (live) setOptions(map);
    })();
    return () => {
      live = false;
    };
  }, [fields]);

  const byName = useMemo(() => new Map(fields.map((f) => [f.name, f])), [fields]);
  const ctx: DescribeContext = useMemo(
    () => ({
      labelOf: (name) => byName.get(name)?.label ?? name,
      valueOf: (name, v: Scalar) =>
        options.get(name)?.find((o) => o.value === String(v))?.label ?? String(v ?? '—'),
    }),
    [byName, options],
  );

  const rules: RuleRow[] = useMemo(
    () =>
      fields.flatMap((f) =>
        rulesOf(f.conditions, ctx).map((r) => ({
          key: `${f.id}:${r.key}`,
          field_id: f.id,
          field_label: f.label,
          accordion_title: f.accordion_title,
          rule_key: r.key,
          effect: r.effect,
          when: r.when,
        })),
      ),
    [fields, ctx],
  );

  const control = byName.get(controlling);
  const ops = control ? operatorsFor(control.field_type) : [];

  // Loaded when the controlling field is chosen, not all at once: one request
  // for the field in hand, so its values are there before the operator looks.
  useEffect(() => {
    let live = true;
    setValueOptions([]);
    setValuesError(null);
    if (!control) return;
    setLoadingValues(true);
    void (async () => {
      let list: { value: string; label: string }[] = [];
      let problem: string | null = null;
      if (control.field_type === 'select') {
        if (control.options_static && control.options_static.length > 0) {
          list = control.options_static.map((o) => ({ value: String(o.value), label: o.label }));
        } else if (control.options_source) {
          const rows = await fetchMasterOptions(control.options_source, control.options_label_field ?? 'name');
          list = rows.map((r) => ({ value: String(r.id), label: r.label }));
          if (list.length === 0) problem = `No options could be loaded for ${control.label}.`;
        }
      } else {
        const res = await safeFetchJson<string[]>(
          `/api/v1/master-page-conditions/values?page_id=${pageId}&field=${encodeURIComponent(control.name)}`,
        );
        if (res.ok) {
          // A date reads DD-MM-YYYY (§4.19) but is stored — and compared — as ISO.
          list = res.data.map((v) => ({ value: v, label: control.field_type === 'date' ? formatDate(v) : v }));
          if (list.length === 0) problem = `No ${control.label} has been recorded yet, so there is nothing to choose from.`;
        } else problem = res.message;
      }
      if (!live) return;
      setValueOptions(list);
      setValuesError(problem);
      setLoadingValues(false);
    })();
    return () => {
      live = false;
    };
  }, [control, pageId]);

  const fieldLabel = (f: ConditionField): string => `${f.accordion_title} › ${f.label}`;
  const controllingOptions = fields
    .filter((f) => CONTROLLING_TYPES.has(f.field_type))
    .map((f) => ({ value: f.name, label: fieldLabel(f) }));
  const targetOptions = fields
    .filter((f) => f.name !== controlling)
    .map((f) => ({ value: f.name, label: f.label, detail: f.accordion_title }));

  // A rule of this kind already on a target is REPLACED — say so before saving.
  const replacing = targets
    .map((t) => byName.get(t))
    .filter((f): f is ConditionField => Boolean(f?.conditions?.[EFFECT_KEY[effect]]))
    .map((f) => f.label);

  const preview = (() => {
    if (!control || targets.length === 0) return null;
    if (operatorNeedsValue(operator) && values.length === 0) return null;
    const verb = RULE_EFFECTS.find((e) => e.value === effect)?.verb ?? '';
    const names = targets.map((t) => byName.get(t)?.label ?? t).join(', ');
    return `${verb} ${names} when ${describePredicate(buildLeaf(control.name, operator, values), ctx)}.`;
  })();

  const reset = (): void => {
    setControlling('');
    setOperator('eq');
    setValues([]);
    setTargets([]);
    setInvalid(null);
  };

  const save = async (): Promise<void> => {
    const missing = !control
      ? 'controlling'
      : operatorNeedsValue(operator) && values.filter((v) => v.trim() !== '').length === 0
        ? 'values'
        : targets.length === 0
          ? 'targets'
          : null;
    if (missing) {
      setInvalid(missing);
      return;
    }
    setInvalid(null);
    setSaving(true);
    const fresh = predicateForEffect(effect, buildLeaf(control!.name, operator, values));
    const key = EFFECT_KEY[effect];
    const failures: string[] = [];
    for (const name of targets) {
      const f = byName.get(name);
      if (!f) continue;
      const existing = f.conditions?.[key] as Predicate | undefined;
      // "all" — the field shows (or is required / locked) only when the old rule
      // AND the new one both say so.
      const predicate: Predicate = keepExisting && existing ? { all: [existing, fresh] } : fresh;
      const res = await safeFetchJson(`/api/v1/master-page-conditions/${f.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, predicate }),
      });
      if (!res.ok) failures.push(`${f.label}: ${res.message}`);
    }
    setSaving(false);
    if (failures.length > 0) {
      setResult({ status: 'error', title: 'Not saved', message: failures.join(' ') });
    } else {
      setResult({ status: 'success', title: 'Saved', message: preview ?? 'The rule was saved.' });
      reset();
    }
    void load();
  };

  const remove = async (): Promise<void> => {
    if (!removing) return;
    const res = await safeFetchJson(`/api/v1/master-page-conditions/${removing.field_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: removing.rule_key, predicate: null }),
    });
    const label = removing.field_label;
    setRemoving(null);
    setResult(
      res.ok
        ? { status: 'success', title: 'Deleted', message: `The rule on ${label} was removed — it now always follows its own settings.` }
        : { status: 'error', title: 'Not deleted', message: res.message || 'The rule could not be removed.' },
    );
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 bg-brand-gradient px-4 py-3 text-white">
          <Wand2 className="h-4 w-4" />
          <h2 className="text-sm font-semibold">New rule — change fields based on another field&rsquo;s value</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0">
            <label className="label required">When this field</label>
            <SearchableSelect
              value={controlling}
              onChange={(v) => {
                setControlling(v);
                setValues([]);
                const f = byName.get(v);
                setOperator(f ? operatorsFor(f.field_type)[0]! : 'eq');
                setTargets((prev) => prev.filter((t) => t !== v));
              }}
              options={controllingOptions}
              placeholder="e.g. Type of Goods"
              required
              invalid={invalid === 'controlling'}
              aria-label="Controlling field"
            />
          </div>

          <div className="min-w-0">
            <label className="label required">Condition</label>
            <SearchableSelect
              value={operator}
              onChange={(v) => { setOperator(v as RuleOperator); setValues([]); }}
              options={ops.map((o) => ({ value: o, label: OPERATOR_LABELS[o] }))}
              placeholder="Choose the field first"
              disabled={!control}
              aria-label="Condition"
            />
          </div>

          <div className="min-w-0 xl:col-span-2">
            <label className={`label ${operatorNeedsValue(operator) ? 'required' : ''}`}>Value</label>
            {operatorTakesList(operator) ? (
              <MultiSelect
                values={values}
                onChange={setValues}
                options={valueOptions}
                placeholder={
                  !control ? 'Choose the field first' : loadingValues ? 'Loading values…' : `Choose ${control.label} values`
                }
                noun="values"
                emptyText={valuesError ?? 'No values'}
                disabled={!control || loadingValues}
                invalid={invalid === 'values'}
                aria-label="Values"
              />
            ) : (
              <SearchableSelect
                value={values[0] ?? ''}
                onChange={(v) => setValues(v ? [v] : [])}
                options={valueOptions}
                placeholder={
                  !control
                    ? 'Choose the field first'
                    : !operatorNeedsValue(operator)
                      ? 'No value needed'
                      : loadingValues
                        ? 'Loading values…'
                        : `Choose a ${control.label}`
                }
                disabled={!control || !operatorNeedsValue(operator) || loadingValues}
                invalid={invalid === 'values'}
                aria-label="Value"
              />
            )}
            {control && operatorNeedsValue(operator) && valuesError && !loadingValues && (
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">{valuesError}</p>
            )}
          </div>

          <div className="min-w-0">
            <label className="label required">Then</label>
            <SearchableSelect
              value={effect}
              onChange={(v) => setEffect(v as RuleEffect)}
              options={RULE_EFFECTS.map((e) => ({ value: e.value, label: e.label }))}
              aria-label="Effect"
            />
          </div>

          <div className="min-w-0 md:col-span-1 xl:col-span-3">
            <label className="label required">These fields</label>
            <MultiSelect
              values={targets}
              onChange={setTargets}
              options={targetOptions}
              placeholder="Fields to show, hide, require or lock"
              noun="fields"
              invalid={invalid === 'targets'}
              aria-label="Target fields"
            />
          </div>
        </div>

        {(preview || replacing.length > 0) && (
          <div className="space-y-1 border-t border-border px-4 py-3">
            {preview && (
              <p className="flex items-start gap-2 text-sm text-foreground">
                <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" /> {preview}
              </p>
            )}
            {replacing.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  {replacing.join(', ')} already {replacing.length === 1 ? 'has' : 'have'} a rule of this kind.{' '}
                  {keepExisting ? 'Both rules will have to hold.' : 'Saving replaces it.'}
                </p>
                <Toggle size="sm" checked={keepExisting} onChange={setKeepExisting} label="Keep the existing rule too" />
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {invalid ? 'Fill in the fields marked in red.' : 'Rules apply on the form and when the record is saved.'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="btn-secondary btn-sm">Clear</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary btn-sm">
              <Plus className="h-4 w-4" /> {saving ? 'Saving…' : 'Save rule'}
            </button>
          </div>
        </div>
      </div>

      <DataTable<RuleRow>
        title="Rules on this page"
        rows={rules}
        loading={loading}
        rowKey={(r) => r.key}
        searchPlaceholder="Search field, section, rule..."
        emptyMessage="No conditional rules on this page yet — build one above."
        columns={[
          { key: 'field_label', header: 'Field', className: 'font-medium' },
          { key: 'accordion_title', header: 'Section' },
          {
            key: 'effect',
            header: 'Effect',
            value: (r) => EFFECT_STYLE[r.effect].label,
            render: (r) => {
              const s = EFFECT_STYLE[r.effect];
              const Icon = s.icon;
              return (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${s.cls}`}>
                  <Icon className="h-3.5 w-3.5" /> {s.label}
                </span>
              );
            },
          },
          { key: 'when', header: 'Condition', render: (r) => <span className="block max-w-md" title={r.when}>{r.when}</span> },
        ]}
        actions={(r) => ({
          extra: (
            <button type="button" onClick={() => setRemoving(r)} title="Remove this rule" className="ico-delete" aria-label={`Remove the rule on ${r.field_label}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          ),
        })}
      />

      <ConfirmDialog
        open={removing !== null}
        title={`Remove the rule on ${removing?.field_label ?? ''}?`}
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      >
        {removing
          ? `${EFFECT_STYLE[removing.effect].label} ${removing.when}. After removing it, ${removing.field_label} follows its own settings on every record.`
          : ''}
      </ConfirmDialog>

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </div>
  );
}
