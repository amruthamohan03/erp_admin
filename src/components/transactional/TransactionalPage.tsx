'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import BackButton from '@/components/ui/BackButton';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { parseConditions, resolveFieldState } from '@/lib/pages/conditions';
import {
  parseDerive,
  isPureDerive,
  isAsyncDerive,
  isEditableDerive,
  computePureDerive,
  deriveTriggers,
  INIT_TRIGGER,
} from '@/lib/pages/derive';
import { parentListRoute } from '@/lib/pages/listRoute';
import type { PageDef, PageFetchResponse } from '@/types';
import Accordion, { type ResolvedField } from './Accordion';

interface TransactionalPageProps {
  slug: string;
  entityId: string;
}

export default function TransactionalPage({ slug, entityId }: TransactionalPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [page, setPage] = useState<PageDef | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // §4.17 — one save for the whole page, so its state lives here rather than being
  // duplicated per section.
  const [openSlugs, setOpenSlugs] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // §4.22 — the acknowledged outcome of the save. On success, dismissing it is
  // what navigates to the list; on failure it just closes.
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  // Only a user edit sets `dirty` — the reactive pure-derive pass below writes
  // values without touching it, so loading a record never looks unsaved.
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const url = entityId === 'new'
      ? `/api/v1/pages/${slug}`
      : `/api/v1/pages/${slug}?entity_id=${entityId}`;
    const result = await safeFetchJson<PageFetchResponse>(url);
    if (!result.ok) {
      setError(
        [
          result.message,
          result.status ? `(status ${result.status})` : null,
          result.detail ? `\nDetail: ${result.detail}` : null,
        ].filter(Boolean).join(' '),
      );
      setLoading(false);
      return;
    }
    setPage(result.data.page);
    setValues(result.data.values ?? {});
    // §4.34 — every section opens with the page. One save covers the whole form
    // (§4.17), so a collapsed section is still being submitted; hiding it means
    // an operator fills in what they can see, saves, and is told a required field
    // three sections down is empty. Opening everything makes the form's real
    // extent visible from the start, and the operator collapses what they don't
    // need rather than hunting for what they do.
    setOpenSlugs(new Set(result.data.page.accordions.map((a) => a.slug)));
    setDirty(false);
    setInvalidFields(new Set());
    setLoading(false);
  }, [slug, entityId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Where this record's list lives — the parent path, derived from the URL rather
  // than from the drift-prone master_page_t.route. See listRoute.ts.
  const listRoute = useMemo(() => parentListRoute(pathname, page?.route), [pathname, page?.route]);

  // Flatten every field once per page load for derive bookkeeping.
  const allFields = useMemo(
    () => page?.accordions.flatMap((a) => a.fields) ?? [],
    [page],
  );

  // Fields whose change triggers an async (fromRelated / template) derive — e.g.
  // picking a license autofills kind/goods/currency/remaining, picking a client
  // fills Liquidation Paid By, and either rebuilds the MCA reference.
  const asyncTriggers = useMemo(() => {
    const s = new Set<string>();
    for (const f of allFields) {
      const spec = parseDerive(f.derive);
      for (const t of deriveTriggers(spec)) s.add(t);
    }
    return s;
  }, [allFields]);

  // Derived fields the page owns outright — an async derive that did NOT opt into
  // `editable`, so it renders read-only and mirrors its source. Only these are
  // safe to backfill on load: the operator cannot have cleared one deliberately,
  // so an empty one is missing data rather than a choice.
  const authoritativeFields = useMemo(() => {
    const s = new Set<string>();
    for (const f of allFields) {
      const spec = parseDerive(f.derive);
      if (isAsyncDerive(spec) && !isEditableDerive(spec)) s.add(f.name);
    }
    return s;
  }, [allFields]);

  // §4.12 — resolve async derives on the server and merge the returned values.
  //
  // `mode` decides what merging means:
  //   replace — the user changed the trigger, so the derived values are now
  //             authoritative and overwrite whatever was there.
  //   fill    — the page just loaded an existing record; only blanks are filled,
  //             and never over a value the record already holds.
  const runAsyncDerive = useCallback(
    async (
      triggerField: string,
      current: Record<string, unknown>,
      mode: 'replace' | 'fill' = 'replace',
    ) => {
      const res = await fetch(`/api/v1/pages/${slug}/derive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger_field: triggerField, values: current }),
      });
      const json: { ok: boolean; data?: { values: Record<string, unknown> } } = await res.json();
      if (!res.ok || !json.ok || !json.data) return;

      if (mode === 'replace') {
        setValues((prev) => ({ ...prev, ...json.data!.values }));
        return;
      }

      // Compared against the snapshot this fill was started from rather than
      // against `prev`, so the decision stays a pure calculation outside the
      // state updater.
      const empty = (v: unknown) => v === null || v === undefined || v === '';
      const filled: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(json.data.values)) {
        if (empty(value) || !empty(current[name])) continue;
        if (!authoritativeFields.has(name)) continue;
        filled[name] = value;
      }
      if (Object.keys(filled).length === 0) return;

      setValues((prev) => ({ ...prev, ...filled }));
      // Say so. These are proposed values, not stored ones — leaving the page
      // clean would show a completed record that silently reverts on reload.
      setDirty(true);
    },
    [slug, authoritativeFields],
  );

  // §4.12 — prefill derives (INIT_TRIGGER) have no triggering field: they fire
  // once, when a NEW record's form opens. Only for a new record — re-running it
  // on an existing one would overwrite a stored verifier with whoever happened
  // to open the page.
  const initRan = useRef(false);
  useEffect(() => {
    if (!page || entityId !== 'new' || initRan.current) return;
    if (!asyncTriggers.has(INIT_TRIGGER)) return;
    // The ref guard is what makes this once-only, so depending on `values` is
    // safe — and reading them directly avoids setting state inside the effect.
    initRan.current = true;
    // The state write happens after the fetch resolves, not during this effect,
    // and the ref guard makes it once-only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runAsyncDerive(INIT_TRIGGER, values);
  }, [page, entityId, asyncTriggers, runAsyncDerive, values]);

  // §4.12 — an EXISTING record fills its derived blanks when it opens.
  //
  // An async derive fires when its trigger CHANGES, which is exactly what a
  // create needs and exactly what an update does not: the licence is already
  // chosen, so nothing changes, so kind / type of goods / transport mode /
  // currency stay blank on a record that never had them written. Export tracking
  // shows this plainly — its records are created from the grid, which does not
  // capture those fields, so every one of them opened with the mirrors empty and
  // no way to populate them short of re-picking a licence that was already right.
  //
  // Only blanks are touched, and only the read-only mirrors (see
  // `authoritativeFields`), so nothing the record already holds is overwritten.
  const fillRan = useRef(false);
  useEffect(() => {
    if (!page || entityId === 'new' || fillRan.current) return;
    const ready = [...asyncTriggers].filter(
      (t) => t !== INIT_TRIGGER && values[t] !== null && values[t] !== undefined && values[t] !== '',
    );
    if (ready.length === 0) return;
    // Once-only via the ref, so depending on `values` is safe even though the
    // fills below write to it.
    fillRan.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    for (const trigger of ready) void runAsyncDerive(trigger, values, 'fill');
  }, [page, entityId, asyncTriggers, runAsyncDerive, values]);

  const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
    setDirty(true);
    setSavedAt(null);
    // Clear this field's error as soon as the user addresses it.
    setInvalidFields((prev) => {
      if (!prev.has(fieldName)) return prev;
      const next = new Set(prev);
      next.delete(fieldName);
      return next;
    });
    setValues((prev) => {
      const next = { ...prev, [fieldName]: value };
      if (asyncTriggers.has(fieldName)) void runAsyncDerive(fieldName, next);
      return next;
    });
  }, [asyncTriggers, runAsyncDerive]);

  // Pure derives (statusMap / formula) recompute reactively from the current
  // values. Compare as strings so a numeric result doesn't churn against a
  // stringified field value.
  useEffect(() => {
    if (!page) return;
    let next: Record<string, unknown> | null = null;
    for (const f of allFields) {
      const spec = parseDerive(f.derive);
      if (!isPureDerive(spec)) continue;
      const computed = computePureDerive(spec, values);
      if (computed === undefined) continue;
      if (String(computed) !== String(values[f.name] ?? '')) {
        if (!next) next = { ...values };
        next[f.name] = computed;
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (next) setValues(next);
  }, [values, page, allFields]);

  // §4.12 — every field's effective state, resolved once per render against the
  // current values. The page needs this to build the save payload; the accordions
  // render from it, so the work is not repeated per section (§4.10).
  const resolvedByAccordion = useMemo(() => {
    const map = new Map<string, ResolvedField[]>();
    for (const acc of page?.accordions ?? []) {
      map.set(
        acc.slug,
        acc.fields.map((field) => ({
          field,
          state: resolveFieldState(parseConditions(field.conditions), field.required, values),
        })),
      );
    }
    return map;
  }, [page, values]);

  const editableAccordions = useMemo(
    () => (page?.accordions ?? []).filter((a) => a.permission === 'edit'),
    [page],
  );

  function toggleAccordion(accSlug: string) {
    setOpenSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(accSlug)) next.delete(accSlug);
      else next.add(accSlug);
      return next;
    });
  }

  // §4.17 — the page's single save. Every editable section goes up in ONE request,
  // which the server commits as one transaction: either the whole form lands or
  // none of it does.
  const handleSave = useCallback(async () => {
    if (!page) return;
    setSaving(true);
    setSaveError(null);
    setInvalidFields(new Set());

    const accordions = editableAccordions.map((acc) => {
      const visible = (resolvedByAccordion.get(acc.slug) ?? []).filter((r) => r.state.visible);
      const payloadValues: Record<string, unknown> = {};
      for (const { field } of visible) {
        payloadValues[field.name] = values[field.name] ?? null;
      }
      return { slug: acc.slug, values: payloadValues };
    });

    try {
      // Same helper the load path uses (§4.10). A raw res.json() here turned any
      // empty-bodied or non-JSON response into "JSON.parse: unexpected end of
      // data", which told the user nothing about what actually failed.
      const result = await safeFetchJson<{ id: number }>(`/api/v1/pages/${slug}/${entityId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accordions }),
      });

      if (!result.ok) {
        const field = result.field;
        if (field) {
          setInvalidFields(new Set([field]));
          // The offending field may sit in a collapsed section — open it so the
          // message points at something the user can actually see.
          for (const [accSlug, fields] of resolvedByAccordion) {
            if (fields.some((r) => r.field.name === field && r.state.visible)) {
              setOpenSlugs((prev) => new Set(prev).add(accSlug));
              break;
            }
          }
        }
        setSaveError([result.message, result.detail].filter(Boolean).join(' — ') || 'Save failed');
        // §4.22 — state the outcome. Dismissing returns to the form, which still
        // holds the work with the offending field marked.
        setSaveResult({
          status: 'error',
          title: entityId === 'new' ? 'Not created' : 'Not saved',
          message: result.message || 'The record could not be saved.',
          detail: result.detail,
        });
        return;
      }

      setSavedAt(new Date());
      setDirty(false);
      // §4.22 — confirm before moving. Navigating straight to the list on success
      // is indistinguishable from the page changing on its own; the operator gets
      // told the record was written, and OK carries them to the list.
      setSaveResult({
        status: 'success',
        title: entityId === 'new' ? 'Created' : 'Saved',
        message:
          entityId === 'new'
            ? `${page.title} created successfully.`
            : `Your changes to this ${page.title.toLowerCase()} have been saved.`,
      });
    } catch (e) {
      setSaveError((e as Error).message || 'Save failed');
    } finally {
      setSaving(false);
    }
    // Navigation moved to the result dialog's OK, so the save itself no longer
    // touches the router or the list route.
  }, [page, editableAccordions, resolvedByAccordion, values, slug, entityId]);

  return (
    <>
      {/* §4.13 — Back goes to the page's own list view (e.g. /clients) so
          refresh + back still lands somewhere useful for the user. */}
      <div className="mb-4">
        <BackButton fallback={listRoute} />
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          {page?.title ?? 'Loading...'}
          {entityId === 'new' && page && <span className="ml-2 text-sm font-normal text-muted-foreground">— New</span>}
        </h1>
      </div>

      {loading && (
        <div className="card p-6 text-center text-muted-foreground">Loading page definition...</div>
      )}

      {!loading && error && (
        <div className="rounded-md bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30">
          {error}
        </div>
      )}

      {!loading && !error && page && (
        <form onSubmit={(e) => { e.preventDefault(); void handleSave(); }}>
          {/* Bottom padding clears the sticky action bar so the last section's
              fields are never hidden behind it. */}
          <div className="pb-24">
            {page.accordions.map((acc, idx) => (
              <Accordion
                key={acc.id}
                accordion={acc}
                values={values}
                onChange={handleFieldChange}
                resolved={resolvedByAccordion.get(acc.slug) ?? []}
                open={openSlugs.has(acc.slug)}
                onToggle={() => toggleAccordion(acc.slug)}
                invalidFields={invalidFields}
                accentIndex={idx}
                entityType={`page:${slug}`}
                entityId={entityId}
              />
            ))}
          </div>

          {editableAccordions.length > 0 && (
            <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-card/95 px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] backdrop-blur sm:-mx-6 sm:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                {saveError && (
                  <span className="flex-1 text-sm text-red-600 dark:text-red-400">{saveError}</span>
                )}
                {!saveError && savedAt && !saving && (
                  <span className="flex-1 inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Saved {savedAt.toLocaleTimeString()}
                  </span>
                )}
                {!saveError && !savedAt && dirty && (
                  <span className="flex-1 text-xs text-muted-foreground">Unsaved changes</span>
                )}
                {/* §4.21 — a labelled way out, beside Save rather than only the
                    browser's back button. Confirms first when there is work to
                    lose; leaving a clean form needs no ceremony. */}
                <button
                  type="button"
                  onClick={() => {
                    if (dirty && !confirm('Discard your unsaved changes?')) return;
                    router.push(listRoute);
                  }}
                  disabled={saving}
                  className="btn-secondary sm:w-auto"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary sm:w-auto">
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving…' : entityId === 'new' ? 'Create' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      {/* §4.22 — OK on a successful save is what carries the user to the list;
          on a failure it closes and leaves the form intact. */}
      <ResultDialog
        result={saveResult}
        okLabel="OK"
        onDismiss={() => {
          const wasSuccess = saveResult?.status === 'success';
          setSaveResult(null);
          if (wasSuccess) router.replace(listRoute);
        }}
      />
    </>
  );
}
