'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ListChecks,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Toggle from '@/components/ui/Toggle';
import { safeFetchJson } from '@/lib/safeFetch';
import type { McaLine } from '@/db/schema';

// §2 step 6 — the payment request's MCA reference lines, rendered inside the
// transaction form by FieldRenderer (`field_type: 'mca-grid'`), so the rows are
// written by the page's single Save along with everything else (§4.17, §4.5).
//
// This is the ONLY references grid. A second one used to render below the form
// on /payments/[id] with its own Save button, which meant two controls writing
// the same column — the operator could save one and lose the other — and it did
// not exist at all on /payments/new (§4.10).
//
// Two checks run against every reference, batched into ONE request for the whole
// grid rather than two per row: it must exist in the tracking table for the
// selected client and category, and it must not already be consumed by another
// request with the same expense type. The server re-runs both on save
// (assertPaymentMcaRefs) — this is the fast feedback, not the authority.

const MAX_REFS = 50;
const VALIDATE_DEBOUNCE_MS = 400;

/**
 * What the references are called, per `pay_for`.
 *
 * The reference app renames the section when Payment For changes — an operator
 * filing against Import Tracking is looking for "Import Tracking References",
 * not a generic label they have to translate.
 */
const SECTION_TITLE = [
  'Import Tracking References',
  'Export Tracking References',
  'Local Tracking References',
  'Other References',
  'Pre Payment References',
];

interface Verdict {
  mca_ref: string;
  exists: boolean;
  duplicate: number | null;
  valid: boolean;
}

/** What /payments/mca-options answers: the offerable refs plus what it withheld. */
interface PickerRefs {
  refs: { mca_ref: string }[];
  consumed: number;
}

/** A parsed spreadsheet row, already carrying the server's two verdicts. */
export interface ImportedLine extends McaLine, Verdict {}

/** What /payments/mca-import answers. */
export interface ImportResult {
  lines: ImportedLine[];
  blank: number;
  duplicates: number;
  header_skipped: boolean;
  file_name: string;
  valid_count: number;
  not_found: string[];
  already_claimed: { mca_ref: string; payment_id: number | null }[];
}

/**
 * A message to the operator and how serious it is.
 *
 * `warn` is for anything that leaves work to do — a refused action, a missing
 * field, an import carrying rejected rows. `info` is for an action that
 * succeeded. Rendered as the two colours in NOTICE_TONE below.
 */
interface Notice {
  text: string;
  tone: 'info' | 'warn';
}

/** §4.32 — both themes stated; the dark side tints rather than punches a hole. */
const NOTICE_TONE: Record<Notice['tone'], string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300',
  warn: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
};

/** How many offending references a sentence names before it says "and N more". */
const NAMED_IN_MESSAGE = 3;

/**
 * Name the offending references rather than only counting them (§4.23).
 *
 * "3 references were rejected" sends the operator back to the spreadsheet to
 * work out which three. Capped, because a sheet where every row is wrong must
 * still produce a sentence — the grid colours all of them regardless.
 */
export function nameRefs(refs: readonly string[]): string {
  const shown = refs.slice(0, NAMED_IN_MESSAGE).join(', ');
  const rest = refs.length - NAMED_IN_MESSAGE;
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

/**
 * One sentence for an import: what landed, what was rejected and why, what was
 * skipped. Built apart from the handler because it is pure and long, and because
 * the shape of the message is the part worth reading on its own.
 */
export function importSentence(
  data: ImportResult,
  fresh: readonly ImportedLine[],
  skippedCounts: { alreadyHere: number; overflow: number },
): string {
  const landedGood = fresh.filter((l) => l.valid).length;
  const missing = fresh.filter((l) => !l.exists).map((l) => l.mca_ref);
  const claimed = fresh.filter((l) => l.exists && l.duplicate !== null);

  const parts = [
    `${fresh.length} reference${fresh.length === 1 ? '' : 's'} imported from “${data.file_name}”` +
      `${fresh.length > 0 ? ` — ${landedGood} ready to save` : ''}.`,
  ];

  // The two failures are reported separately: they are different problems with
  // different fixes — one is a wrong reference, the other a reference already
  // spent — and collapsing them into "N invalid" tells the operator neither.
  if (missing.length > 0) {
    parts.push(
      `${missing.length} not found in the tracking system for this client: ${nameRefs(missing)}.`,
    );
  }
  if (claimed.length > 0) {
    parts.push(
      `${claimed.length} already claimed for this expense type: ` +
        `${nameRefs(claimed.map((l) => `${l.mca_ref} (request #${l.duplicate})`))}.`,
    );
  }
  if (missing.length > 0 || claimed.length > 0) {
    parts.push('The red rows must be corrected or removed before this request can be saved.');
  }

  const skipped: string[] = [];
  if (skippedCounts.alreadyHere > 0) skipped.push(`${skippedCounts.alreadyHere} already in the grid`);
  if (data.duplicates > 0) skipped.push(`${data.duplicates} repeated in the file`);
  if (data.blank > 0) skipped.push(`${data.blank} with no reference`);
  if (skippedCounts.overflow > 0) skipped.push(`${skippedCounts.overflow} past the ${MAX_REFS}-reference limit`);
  if (skipped.length > 0) parts.push(`Skipped ${skipped.join(', ')}.`);

  return parts.join(' ');
}

interface McaRefGridProps {
  value: McaLine[];
  onChange: (lines: McaLine[]) => void;
  readonly: boolean;
  clientId: number | null;
  payFor: number | null;
  expenseType: number | null;
  /** The request being edited, excluded from the duplicate check; null when creating. */
  paymentId: number | null;
  /** Location — its name seeds the OTH-/PRE- prefix for auto-generated references. */
  locationId: number | null;
  invalid?: boolean;
}

/**
 * Other (3) and Pre Payment (4) have no tracking table, so their references are
 * generated from the location rather than picked: OTH-<2 letters>-<n>.
 */
function isAutoRefCategory(payFor: number | null): boolean {
  return payFor === 3 || payFor === 4;
}

function autoRef(payFor: number | null, locationName: string | null, seq: number): string {
  const prefix = payFor === 4 ? 'PRE' : 'OTH';
  const loc = (locationName ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'XX';
  return `${prefix}-${loc}-${seq}`;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const money = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function McaRefGrid({
  value,
  onChange,
  readonly,
  clientId,
  payFor,
  expenseType,
  paymentId,
  locationId,
  invalid,
}: McaRefGridProps) {
  const lines = useMemo(() => (Array.isArray(value) ? value : []), [value]);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [checking, setChecking] = useState(false);
  const [locationName, setLocationName] = useState<string | null>(null);
  // A notice carries its own severity. Two separate states would drift — a
  // failure message left wearing the previous success's colour is worse than no
  // colour at all — so the text and its tone are set together or not at all.
  const [notice, setNotice] = useState<Notice | null>(null);
  const say = (text: string, tone: Notice['tone'] = 'info'): void => setNotice({ text, tone });
  const [bulkRows, setBulkRows] = useState('');
  const [importing, setImporting] = useState(false);

  /** The Select modal: open state, what the server offered, its search and ticks. */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [offered, setOffered] = useState<string[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const auto = isAutoRefCategory(payFor);
  const sectionTitle = (payFor != null ? SECTION_TITLE[payFor] : undefined) ?? 'MCA References';

  // Only Other / Pre Payment build a reference out of the location, so the
  // lookup is skipped entirely for the tracking categories.
  useEffect(() => {
    if (!auto || !locationId) return;
    let cancelled = false;
    fetch(`/api/v1/main-offices/${locationId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.ok) setLocationName(j.data?.main_location_name ?? null);
      })
      .catch(() => {
        // Falls back to the XX placeholder in autoRef().
      });
    return () => {
      cancelled = true;
    };
  }, [auto, locationId]);

  // Batch-validate the whole grid in ONE request, debounced so typing a reference
  // does not fire a request per keystroke. Re-runs when the grid changes and when
  // the inputs the verdicts depend on do — a reference valid for one client or
  // expense type is not necessarily valid for another.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const refs = lines.map((l) => l.mca_ref.trim()).filter(Boolean);
    if (refs.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVerdicts({});
      setChecking(false);
      abortRef.current?.abort();
      return;
    }
    // Synchronising with an external system (the validation endpoint), so the
    // pending flag has to be raised here rather than in a render.
    setChecking(true);

    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetch('/api/v1/payments/mca-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          refs,
          pay_for: payFor,
          client_id: clientId,
          expense_type: expenseType,
          payment_id: paymentId,
        }),
      })
        .then((r) => r.json())
        .then((j) => {
          if (!j?.ok || !Array.isArray(j.data)) return;
          const next: Record<string, Verdict> = {};
          for (const v of j.data as Verdict[]) next[v.mca_ref.toUpperCase()] = v;
          setVerdicts(next);
        })
        .catch(() => {
          // Aborted or offline — leave the previous verdicts rather than
          // flashing every row to "invalid" on a dropped connection.
        })
        .finally(() => setChecking(false));
    }, VALIDATE_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [lines, payFor, clientId, expenseType, paymentId]);

  function commit(next: McaLine[]): void {
    onChange(next);
  }

  /** Add N blank rows, the way the reference app's number box does. Blank = 1. */
  function addBlankRows(): void {
    const raw = bulkRows.trim();
    const n = raw === '' ? 1 : Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      say(`Enter how many rows to add — a whole number from 1 to ${MAX_REFS}.`, 'warn');
      return;
    }
    const room = MAX_REFS - lines.length;
    if (room <= 0) {
      say(`This grid holds ${MAX_REFS} references and already has ${lines.length}.`, 'warn');
      return;
    }
    if (n > room) {
      say(`${n} rows would pass the ${MAX_REFS}-reference limit — there is room for ${room}.`, 'warn');
      return;
    }
    const blanks = Array.from({ length: n }, (_, i) => ({
      mca_ref: auto ? autoRef(payFor, locationName, lines.length + i + 1) : '',
      amount: 0,
    }));
    commit([...lines, ...blanks]);
    setBulkRows('');
    setNotice(null);
  }

  function updateRow(index: number, patch: Partial<McaLine>): void {
    commit(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function removeRow(index: number): void {
    commit(lines.filter((_, i) => i !== index));
  }

  const total = round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const used = useMemo(
    () => new Set(lines.map((l) => l.mca_ref.trim().toUpperCase()).filter(Boolean)),
    [lines],
  );

  /**
   * Why this verb cannot run yet, or null when it can.
   *
   * Select and Import need exactly the same three header fields for exactly the
   * same reasons, so they ask one question (§4.10). The order follows the form's
   * own, and each refusal names the field rather than the button going quietly
   * dead — a greyed-out control with no reason is the defect §4.23 exists to
   * prevent. Expense type is not optional for either: a reference maps ONE-TO-ONE
   * to an expense type, so without it neither the picker can be filtered to what
   * is claimable nor an imported row checked against what is already claimed.
   *
   * The server asks the same three questions on its own routes — this is the fast
   * answer, not the authority.
   */
  function contextGap(verb: 'picking' | 'importing'): string | null {
    if (clientId === null) {
      return `Select a Client before ${verb} references — they are checked against that client’s tracking files.`;
    }
    if (payFor === null) {
      return `Select Payment For before ${verb} references — it decides which tracking table is searched.`;
    }
    if (expenseType === null) {
      return `Select an Expense Type before ${verb} references — each reference can be claimed once per expense type.`;
    }
    return null;
  }

  /** Open the reference picker. */
  async function openPicker(): Promise<void> {
    const gap = contextGap('picking');
    if (gap) {
      say(gap, 'warn');
      return;
    }

    setNotice(null);
    setPicked(new Set());
    setPickerSearch('');
    setOffered([]);
    setPickerLoading(true);
    setPickerOpen(true);

    const params = new URLSearchParams({
      client_id: String(clientId),
      pay_for: String(payFor),
      expense_type: String(expenseType),
    });
    if (paymentId) params.set('payment_id', String(paymentId));

    const res = await safeFetchJson<PickerRefs>(`/api/v1/payments/mca-options?${params}`);
    setPickerLoading(false);
    if (!res.ok) {
      setPickerOpen(false);
      say(res.message, 'warn');
      return;
    }

    const fresh = res.data.refs.map((r) => r.mca_ref).filter((ref) => !used.has(ref.trim().toUpperCase()));
    setOffered(fresh);

    // "Empty" is three different situations and an operator can only act on the
    // one they are actually in, so each says which.
    if (fresh.length === 0) {
      setPickerOpen(false);
      if (res.data.consumed > 0) {
        say(
          `Every ${sectionTitle.toLowerCase()} for this client — ${res.data.consumed} in total — is already claimed by another request for this expense type.`,
          'warn',
        );
      } else if (res.data.refs.length > 0) {
        say('Every reference this client has is already on this request.', 'warn');
      } else {
        say('No MCA references found for this client in the tracking system.', 'warn');
      }
    }
  }

  /** Commit the ticked references as new rows, in the order they are listed. */
  function applyPicked(): void {
    const chosen = offered.filter((ref) => picked.has(ref)).slice(0, MAX_REFS - lines.length);
    if (chosen.length > 0) {
      commit([...lines, ...chosen.map((mca_ref) => ({ mca_ref, amount: 0 }))]);
      say(`${chosen.length} reference${chosen.length === 1 ? '' : 's'} added. Enter the amounts.`);
    }
    setPickerOpen(false);
  }

  /**
   * Import a spreadsheet of references.
   *
   * The server parses, CHECKS and returns rows; nothing is written. Each row
   * comes back with the same two verdicts the typed path gets — it exists in
   * this client's tracking table, and it is not already claimed for this expense
   * type — so a sheet of forty references reports its bad rows on arrival rather
   * than at Save, where the operator would only learn that one of them is wrong.
   *
   * Failing rows are ADDED and marked red, not dropped: the operator has to see
   * which line of their spreadsheet is the problem in order to fix it, and a
   * silently shortened import is one they cannot reconcile against the file.
   *
   * References already in the grid are dropped here rather than server-side,
   * because "already in the grid" is a fact about unsaved UI state the server
   * cannot see.
   */
  async function importSheet(file: File): Promise<void> {
    const gap = contextGap('importing');
    if (gap) {
      say(gap, 'warn');
      return;
    }

    setImporting(true);
    setNotice(null);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('client_id', String(clientId));
      body.append('pay_for', String(payFor));
      body.append('expense_type', String(expenseType));
      if (paymentId) body.append('payment_id', String(paymentId));

      const res = await safeFetchJson<ImportResult>('/api/v1/payments/mca-import', {
        method: 'POST',
        body,
      });

      if (!res.ok) {
        say(res.message, 'warn');
        return;
      }

      const room = Math.max(MAX_REFS - lines.length, 0);
      const unseen = res.data.lines.filter((l) => !used.has(l.mca_ref.trim().toUpperCase()));
      const fresh = unseen.slice(0, room);
      const alreadyHere = res.data.lines.length - unseen.length;
      const overflow = unseen.length - fresh.length;

      if (fresh.length > 0) {
        commit([...lines, ...fresh.map((l) => ({ mca_ref: l.mca_ref, amount: l.amount }))]);
        // Seed the verdicts from the import's own pass so the new rows are
        // coloured immediately. Without this they sit uncoloured for the
        // debounce and then turn red, which reads as the grid changing its mind.
        setVerdicts((prev) => {
          const next = { ...prev };
          for (const l of fresh) {
            next[l.mca_ref.trim().toUpperCase()] = {
              mca_ref: l.mca_ref,
              exists: l.exists,
              duplicate: l.duplicate,
              valid: l.valid,
            };
          }
          return next;
        });
      }

      // An import that landed rejected rows is not a success message wearing a
      // longer sentence — it leaves the operator work to do, so it says so in
      // the colour that means that.
      const rejected = fresh.some((l) => !l.valid);
      say(importSentence(res.data, fresh, { alreadyHere, overflow }), rejected ? 'warn' : 'info');
    } finally {
      setImporting(false);
    }
  }

  /** What the modal is showing after its own search box. */
  const pickerVisible = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return q ? offered.filter((ref) => ref.toLowerCase().includes(q)) : offered;
  }, [offered, pickerSearch]);

  // In-grid duplicates are caught here rather than server-side, so the second
  // occurrence is marked as the user types it.
  const duplicateRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of lines) {
      const up = l.mca_ref.trim().toUpperCase();
      if (up) counts.set(up, (counts.get(up) ?? 0) + 1);
    }
    return counts;
  }, [lines]);

  /**
   * A row's verdict, as both a status cell and a tone for the reference itself.
   *
   * One resolver for both so the green in the input and the green in the status
   * column can never disagree (§4.10). `tone` is the *decided* states only —
   * "checking" and "not yet typed" leave the input in its normal colours rather
   * than guessing, because a reference flashing green before it has been checked
   * is worse than one that is briefly uncoloured.
   */
  function statusFor(
    line: McaLine,
    index: number,
  ): { icon: React.ReactNode; text: string; cls: string; tone: 'ok' | 'bad' | null } | null {
    const ref = line.mca_ref.trim();
    if (!ref) return null;
    const up = ref.toUpperCase();
    if ((duplicateRows.get(up) ?? 0) > 1 && lines.findIndex((l) => l.mca_ref.trim().toUpperCase() === up) !== index) {
      return {
        icon: <AlertCircle className="h-3.5 w-3.5" />,
        text: 'Listed twice',
        cls: 'text-red-600 dark:text-red-400',
        tone: 'bad',
      };
    }
    const v = verdicts[up];
    if (!v) {
      return checking
        ? {
            icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
            text: 'Checking…',
            cls: 'text-muted-foreground',
            tone: null,
          }
        : null;
    }
    if (v.valid) {
      return {
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        text: 'OK',
        cls: 'text-emerald-600 dark:text-emerald-400',
        tone: 'ok',
      };
    }
    return {
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      // The two failures read differently because they are fixed differently:
      // a reference that is not there at all versus one that is already spent.
      text: !v.exists ? 'Not found in tracking' : `Already claimed by #${v.duplicate}`,
      cls: 'text-red-600 dark:text-red-400',
      tone: 'bad',
    };
  }

  /**
   * §4.32 — a semantic colour states both themes. The dark side is a translucent
   * fill of the mid shade so it tints the row rather than punching a coloured
   * hole in it, with a light text step that stays readable on a dark card.
   */
  const REF_TONE: Record<'ok' | 'bad', string> = {
    ok: 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-300',
    bad: 'border-red-400 bg-red-50 text-red-800 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-300',
  };

  return (
    <div
      className={`rounded-md border ${invalid ? 'border-red-400 dark:border-red-500' : 'border-border'}`}
      aria-invalid={invalid || undefined}
    >
      {!readonly && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="mca-bulk-rows" className="sr-only">
              Number of blank rows to add
            </label>
            <input
              id="mca-bulk-rows"
              type="number"
              min={1}
              max={MAX_REFS}
              value={bulkRows}
              onChange={(e) => setBulkRows(e.target.value)}
              placeholder="0"
              className="input h-9 w-20 min-w-0 text-center"
            />
            <button type="button" onClick={addBlankRows} className="btn-primary btn-sm">
              <Plus className="h-4 w-4" /> {auto ? 'Generate' : 'Add'}
            </button>
            {!auto && (
              <button type="button" onClick={() => void openPicker()} className="btn-select btn-sm">
                <ListChecks className="h-4 w-4" /> Select
              </button>
            )}
            {/* A file input styled as a button: the control has to BE the input
                for the picker to open, so the label wraps it and the input is
                visually hidden rather than display:none — which would take it
                out of the tab order. */}
            <label className={`btn-import btn-sm cursor-pointer ${importing ? 'pointer-events-none opacity-50' : ''}`}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importing ? 'Importing…' : 'Import'}
              <input
                type="file"
                accept=".xlsx,.xlsm"
                className="sr-only"
                disabled={importing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  // Clear first: picking the SAME file twice must re-fire change,
                  // and it only does if the value was reset.
                  e.target.value = '';
                  if (f) void importSheet(f);
                }}
              />
            </label>
          </div>
          <div className="text-sm font-semibold text-foreground">
            Total: <span className="tabular-nums">{money(total)}</span>
            <span className="ms-2 text-xs font-normal text-muted-foreground">
              {lines.length} of {MAX_REFS}
            </span>
          </div>
        </div>
      )}

      {notice && (
        <p
          // A refusal has to reach a screen reader the moment it appears — the
          // operator's attention is on the button they just pressed, not here.
          role={notice.tone === 'warn' ? 'alert' : 'status'}
          className={`border-b px-3 py-2 text-sm ${NOTICE_TONE[notice.tone]}`}
        >
          {notice.text}
        </p>
      )}

      {lines.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">
          No references yet.{' '}
          {auto
            ? 'Generate one for this request.'
            : 'Use Select to pick from this client’s tracking files, Import a spreadsheet, or Add a blank row.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base text-xs">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Reference</th>
                <th className="w-40 text-right">Amount</th>
                <th className="w-48">Status</th>
                {!readonly && <th className="w-12" />}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const status = statusFor(line, i);
                return (
                  <tr key={i}>
                    <td className="text-muted-foreground">{i + 1}</td>
                    <td>
                      <input
                        className={`input font-mono text-xs ${status?.tone ? REF_TONE[status.tone] : ''}`}
                        value={line.mca_ref}
                        // Auto-generated references are derived from the location,
                        // not hand-entered — same as the legacy read-only input.
                        readOnly={readonly || auto}
                        disabled={readonly}
                        aria-label={`Reference ${i + 1}`}
                        // Colour is not the only carrier of the verdict: the
                        // status cell beside it says the same thing in words, and
                        // this names it for a screen reader, which reads neither.
                        aria-invalid={status?.tone === 'bad' || undefined}
                        title={status?.tone ? status.text : undefined}
                        onChange={(e) => updateRow(i, { mca_ref: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        className="input text-right text-xs tabular-nums"
                        value={String(line.amount ?? '')}
                        disabled={readonly}
                        aria-label={`Amount for reference ${i + 1}`}
                        onChange={(e) => updateRow(i, { amount: e.target.value === '' ? 0 : Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      {status && (
                        <span className={`inline-flex items-center gap-1 ${status.cls}`}>
                          {status.icon} {status.text}
                        </span>
                      )}
                    </td>
                    {!readonly && (
                      <td className="text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          aria-label={`Remove reference ${i + 1}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td colSpan={2} className="text-right">Total</td>
                <td className="text-right tabular-nums">{money(total)}</td>
                <td colSpan={readonly ? 1 : 2} className="text-xs font-normal text-muted-foreground">
                  drives the header Amount
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPickerOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mca-picker-title"
            className="card flex max-h-[85vh] w-full max-w-2xl flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 id="mca-picker-title" className="font-semibold text-foreground">
                Select {sectionTitle}
              </h3>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                title="Close"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="border-b border-border p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Search references…"
                  aria-label="Search references"
                  className="input min-w-0 w-full ps-9"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {picked.size > 0 && <span className="font-medium text-foreground">{picked.size} selected · </span>}
                Showing {pickerVisible.length} of {offered.length} reference
                {offered.length === 1 ? '' : 's'} claimable for this expense type.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {pickerLoading ? (
                <p className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Looking up this client’s references…
                </p>
              ) : pickerVisible.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Nothing matches “{pickerSearch}”.
                </p>
              ) : (
                <ul>
                  {pickerVisible.map((ref) => {
                    const on = picked.has(ref);
                    return (
                      <li key={ref} className="border-b border-border last:border-b-0">
                        {/* §4.11 — a multi-select option group uses Toggle, never a
                            checkbox. Inside a list the switch needs its own label:
                            the heading above does not name which row it belongs to. */}
                        <label className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-muted/50">
                          <Toggle
                            size="sm"
                            checked={on}
                            aria-label={`${on ? 'Deselect' : 'Select'} ${ref}`}
                            onChange={(v) =>
                              setPicked((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(ref);
                                else next.delete(ref);
                                return next;
                              })
                            }
                          />
                          <span className="font-mono text-sm font-semibold text-foreground">{ref}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* §4.21 — a labelled way out, beside the commit. */}
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button type="button" onClick={() => setPickerOpen(false)} className="btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={applyPicked}
                disabled={picked.size === 0}
                className="btn-primary disabled:opacity-50"
              >
                Apply{picked.size > 0 ? ` (${picked.size})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
