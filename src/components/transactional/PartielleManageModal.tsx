'use client';

// §5 PARTIELLE Management modal — opened from the gear button on the Inspection
// Reports (PARTIELLE) field of EITHER tracking form. It lives beside
// FieldRenderer rather than under modules/imports because both sides use it now:
// a licence's allotments are drawn on by imports and exports alike (§4.10). Shows the licence weight/FOB
// budget and remaining (available) budget, lets the operator create allotments,
// and lists every allotment with its usage (files, weight/FOB used, remaining).
// Ports the legacy "PARTIELLE Management" dialog. On any change it calls
// onChanged so the picker's dropdown refreshes.
import { useCallback, useEffect, useState } from 'react';
import { X, Plus, Save, Loader2, Layers } from 'lucide-react';

interface Row {
  id: number;
  partial_name: string;
  partial_weight: number;
  partial_fob: number;
  weight_used: number;
  fob_used: number;
  no_of_files: number;
  remaining_weight: number;
  remaining_fob: number;
}
interface Summary {
  license: { license_number: string; license_weight: number; license_fob: number; client_name: string; ref_cod: string };
  available: { weight: number; fob: number };
  rows: Row[];
  /** Issued by the configured format (§4.33) — never assembled here. */
  next_reference: string | null;
}

const money = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PartielleManageModal({
  licenseId,
  onClose,
  onChanged,
}: {
  licenseId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', weight: '', fob: '' });
  const [edit, setEdit] = useState<{ id: number; weight: string; fob: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch(`/api/v1/partielles/summary?license_id=${licenseId}`).then((r) => r.json());
      if (j.ok) setData(j.data);
      else setError(j.error?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [licenseId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /**
   * The fixed half of a PARTIELLE number: the licence's REF. COD and its
   * separator. Shown as a locked badge rather than as editable text — it is a
   * property of the licence, not something to retype per allotment, and typing
   * it by hand is how two allotments end up under slightly different references.
   */
  const prefix = data?.license.ref_cod ? `${data.license.ref_cod}-` : '';

  /**
   * The digits the generator would issue next, peeled off the reference it
   * built. Derived by stripping the known prefix rather than by splitting on
   * "-": a REF COD is a full customs reference and may contain its own hyphens
   * (COD-2026-234480), so the LAST segment is not reliably the sequence.
   */
  const suggestedSequence = (() => {
    const ref = data?.next_reference;
    if (!ref) return '';
    return prefix && ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;
  })();

  /** What will actually be created — shown live, so there is no surprise. */
  const fullNumber = form.name.trim() ? `${prefix}${form.name.trim()}` : '';

  /**
   * Open the create form with the next number already filled in.
   *
   * It used to be grey placeholder text, and `create()` returned silently when
   * the field was empty — so the operator saw a number, pressed Save, and
   * nothing happened, with no message.
   */
  function openCreate() {
    setError(null);
    setForm({ name: suggestedSequence, weight: '', fob: '' });
    setShowCreate(true);
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const j = await fetch('/api/v1/partielles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Prefix + digits. Blank digits submit blank, and the server issues
          // the next free reference itself (§4.33) — one generator, whichever
          // way the operator got here.
          partial_name: fullNumber,
          license_id: licenseId,
          partial_weight: Number(form.weight) || 0,
          partial_fob: Number(form.fob) || 0,
        }),
      }).then((r) => r.json());
      if (!j.ok) {
        setError(j.error?.message ?? 'The PARTIELLE could not be created.');
        return;
      }
      setForm({ name: '', weight: '', fob: '' });
      setShowCreate(false);
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!edit) return;
    setBusy(true);
    setError(null);
    try {
      const j = await fetch(`/api/v1/partielles/${edit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partial_weight: Number(edit.weight) || 0, partial_fob: Number(edit.fob) || 0 }),
      }).then((r) => r.json());
      if (!j.ok) {
        setError(j.error?.message ?? 'Save failed');
        return;
      }
      setEdit(null);
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const lic = data?.license;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-2 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="card w-full max-w-5xl my-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-emerald-500 to-green-600">
          <h2 className="font-semibold flex items-center gap-2">
            <Layers className="h-5 w-5" /> PARTIELLE Management{lic ? ` — ${lic.license_number} (${lic.client_name})` : ''}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-white/20"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-auto">
          {error && <div className="rounded-md border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
          {loading && <div className="py-8 text-center text-muted-foreground">Loading…</div>}

          {!loading && lic && (
            <>
              {/* Budget + available boxes */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 p-3 text-sm text-sky-900 dark:text-sky-200 space-y-0.5">
                  <div><span className="font-semibold">Client:</span> {lic.client_name || '—'}</div>
                  <div><span className="font-semibold">REF COD:</span> {lic.ref_cod || '—'}</div>
                  <div><span className="font-semibold">License Weight:</span> {money(lic.license_weight)} KG</div>
                  <div><span className="font-semibold">License FOB:</span> {money(lic.license_fob)}</div>
                </div>
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-900 dark:text-emerald-200 flex flex-col justify-center gap-1">
                  <div className="font-semibold">Available Weight: <span className={data.available.weight < 0 ? 'text-red-600 dark:text-red-400' : ''}>{money(data.available.weight)} KG</span></div>
                  <div className="font-semibold">Available FOB: <span className={data.available.fob < 0 ? 'text-red-600 dark:text-red-400' : ''}>{money(data.available.fob)}</span></div>
                </div>
              </div>

              {/* Add new */}
              {!showCreate ? (
                <button type="button" onClick={openCreate} className="btn-primary">
                  <Plus className="h-4 w-4" /> Add New PARTIELLE
                </button>
              ) : (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3">
                  <div className="flex flex-wrap items-start gap-4">
                  <div>
                    <label htmlFor="partielle-sequence" className="label required">PARTIELLE Number</label>
                    {/* The REF. COD half is fixed and the operator types only the
                        counter — the same split the operation already works to.
                        Rendered through .input-group so the badge and the field
                        read as one control (§4.20), not two. */}
                    <div className="input-group w-64">
                      {prefix && (
                        <span
                          className="input flex w-auto shrink-0 items-center whitespace-nowrap bg-primary-600 font-semibold text-white"
                          title="The licence's REF. COD. Change it on the licence, not here."
                        >
                          {prefix}
                        </span>
                      )}
                      <input
                        id="partielle-sequence"
                        className="input min-w-0 flex-1 font-mono"
                        inputMode="numeric"
                        // The width the configured format issues (§4.33), so the
                        // field cannot accept a counter the format would not print.
                        maxLength={prefix ? Math.max(suggestedSequence.length || 4, 3) : 100}
                        value={form.name}
                        placeholder={suggestedSequence || '0001'}
                        // Digits only while a prefix supplies the rest. With no
                        // REF. COD the operator is typing the WHOLE reference, which
                        // is not numeric, so the filter would eat it.
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            name: prefix ? e.target.value.replace(/[^0-9]/gu, '') : e.target.value,
                          }))
                        }
                      />
                    </div>
                    {/* §4.23 — a missing prefix has one cause and the operator
                        cannot guess it: the number is built from the licence's
                        REF. COD (§4.33). Say so here, not only on a failed save. */}
                    {prefix ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Enter the {suggestedSequence.length || 4}-digit counter — it becomes{' '}
                        <span className="font-mono font-semibold text-foreground">
                          {fullNumber || `${prefix}${suggestedSequence || '0001'}`}
                        </span>
                      </p>
                    ) : (
                      <p className="mt-1 max-w-xs text-xs text-amber-700 dark:text-amber-400">
                        This licence has no REF. COD, so the prefix cannot be filled in.
                        Set it on the licence, or type the whole number here.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="label">Partial Weight (KG)</label>
                    <input type="number" step="0.001" min="0" className="input w-36" value={form.weight}
                      onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} />
                    {/* Repeated beside the input: the licence's remaining budget is
                        the number this one is checked against, and the card holding
                        it is a long way up the modal. */}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Available: <span className="font-semibold text-emerald-700 dark:text-emerald-400">{money(data.available.weight)}</span> KG
                    </p>
                  </div>
                  <div>
                    <label className="label">Partial FOB</label>
                    <input type="number" step="0.01" min="0" className="input w-36" value={form.fob}
                      onChange={(e) => setForm((f) => ({ ...f, fob: e.target.value }))} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Available: <span className="font-semibold text-emerald-700 dark:text-emerald-400">{money(data.available.fob)}</span>
                    </p>
                  </div>
                  </div>

                  {/* §4.21 — a labelled way out beside the commit. */}
                  <div className="mt-3 flex justify-end gap-2 border-t border-emerald-200 pt-3 dark:border-emerald-500/30">
                    <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">
                      Cancel
                    </button>
                    <button type="button" onClick={create} disabled={busy} className="btn-primary disabled:opacity-50">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save PARTIELLE
                    </button>
                  </div>
                </div>
              )}

              {/* Allotment table */}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="table-base whitespace-nowrap text-xs">
                  <thead>
                    <tr>
                      <th className="w-10">#</th>
                      <th>REF COD</th>
                      <th>PARTIELLE Number</th>
                      <th className="text-right">License Weight</th>
                      <th className="text-right">License FOB</th>
                      <th className="text-center">No of Files</th>
                      <th className="text-right">Partial Weight</th>
                      <th className="text-right">Partial FOB</th>
                      <th className="text-right">Weight Used</th>
                      <th className="text-right">FOB Used</th>
                      <th className="text-right">Rem. Weight</th>
                      <th className="text-right">Rem. FOB</th>
                      <th className="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.length === 0 && (
                      <tr><td colSpan={13} className="text-center text-muted-foreground py-6">No allotments yet.</td></tr>
                    )}
                    {data.rows.map((r, idx) => {
                      const editing = edit?.id === r.id;
                      return (
                        <tr key={r.id} className="hover:bg-muted/50">
                          <td className="text-muted-foreground">{idx + 1}</td>
                          <td>{lic.ref_cod || '—'}</td>
                          <td className="font-mono">{r.partial_name}</td>
                          <td className="text-right tabular-nums">{money(lic.license_weight)}</td>
                          <td className="text-right tabular-nums">{money(lic.license_fob)}</td>
                          <td className="text-center"><span className="inline-flex items-center justify-center min-w-[22px] h-5 rounded-full bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 text-[10px] font-semibold px-1.5">{r.no_of_files}</span></td>
                          <td className="text-right">
                            {editing ? (
                              <input type="number" step="0.001" className="input w-24 text-right py-1" value={edit.weight}
                                onChange={(e) => setEdit({ ...edit, weight: e.target.value })} />
                            ) : money(r.partial_weight)}
                          </td>
                          <td className="text-right">
                            {editing ? (
                              <input type="number" step="0.01" className="input w-24 text-right py-1" value={edit.fob}
                                onChange={(e) => setEdit({ ...edit, fob: e.target.value })} />
                            ) : money(r.partial_fob)}
                          </td>
                          <td className="text-right text-muted-foreground tabular-nums">{money(r.weight_used)}</td>
                          <td className="text-right text-muted-foreground tabular-nums">{money(r.fob_used)}</td>
                          <td className={`text-right tabular-nums font-medium ${r.remaining_weight < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{money(r.remaining_weight)}</td>
                          <td className={`text-right tabular-nums font-medium ${r.remaining_fob < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{money(r.remaining_fob)}</td>
                          <td className="text-center">
                            {editing ? (
                              <button type="button" onClick={saveEdit} disabled={busy}
                                className="inline-flex items-center gap-1 rounded bg-primary-600 hover:bg-primary-700 text-white px-2 h-7 text-[11px]">
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                              </button>
                            ) : (
                              <button type="button" onClick={() => setEdit({ id: r.id, weight: String(r.partial_weight), fob: String(r.partial_fob) })}
                                className="text-primary-600 hover:text-primary-800 text-xs font-medium">Resize</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary inline-flex items-center gap-1.5"><X className="h-4 w-4" /> Close</button>
        </div>
      </div>
    </div>
  );
}
