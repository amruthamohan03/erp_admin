'use client';

import { useCallback, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import ActionIcon, { isKnownIcon } from '@/components/ui/ActionIcon';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { ACTION_DEFAULTS, ACTION_STYLE_DEFAULTS, type ActionKey, type ActionStyle } from '@/lib/actionStyles';
import { safeFetchJson } from '@/lib/safeFetch';

// §4.26 — the screen where an administrator restyles every action.
//
// Editing here changes how that action looks on every screen in the ERP, because
// each row feeds a CSS variable the shared action classes read — no component
// names a colour itself (§4.20).

const HEX = /^#[0-9a-fA-F]{6}$/u;

export default function ActionStyleSettings() {
  const [rows, setRows] = useState<ActionStyle[]>(ACTION_STYLE_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await safeFetchJson<ActionStyle[]>('/api/v1/application-settings/actions');
    if (res.ok && Array.isArray(res.data)) setRows(res.data);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function set(key: ActionKey, patch: Partial<ActionStyle>) {
    setRows((prev) => prev.map((r) => (r.action_key === key ? { ...r, ...patch } : r)));
  }

  function resetRow(key: ActionKey) {
    set(key, { ...ACTION_DEFAULTS[key] });
  }

  async function save() {
    // Check before the round trip so the wording matches what the server would
    // say for the same problem (§4.23).
    const bad = rows.find((r) => !HEX.test(r.color)) ?? rows.find((r) => !isKnownIcon(r.icon));
    if (bad) {
      setResult({
        status: 'error',
        title: 'Not saved',
        message: !HEX.test(bad.color)
          ? `${bad.label} colour must be a 6-digit hex value (e.g. #dc2626) — got "${bad.color}".`
          : `${bad.label} icon "${bad.icon}" is not a known icon. Use a lucide name such as ${ACTION_DEFAULTS[bad.action_key].icon}.`,
      });
      return;
    }

    setSaving(true);
    const res = await safeFetchJson<ActionStyle[]>('/api/v1/application-settings/actions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actions: rows }),
    });
    setSaving(false);

    if (!res.ok) {
      setResult({ status: 'error', title: 'Not saved', message: res.message, detail: res.detail });
      return;
    }
    setRows(res.data);
    setResult({
      status: 'success',
      title: 'Saved',
      message: 'Action colours and icons updated. Reload to see them across the app.',
    });
  }

  return (
    <section className="card p-6 lg:col-span-3 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-foreground">Action Colours &amp; Icons</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Applies to every button and row action across the ERP. Icon names come from
            the <a href="https://lucide.dev/icons" target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">lucide</a> set.
          </p>
        </div>
        <button type="button" onClick={save} disabled={saving || loading} className="btn-primary">
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save Actions'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-48">Action</th>
              <th className="w-40">Colour</th>
              <th>Icon</th>
              <th className="w-44">Preview</th>
              <th className="w-20 text-right">Default</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Loading actions…</td></tr>
            )}
            {!loading && rows.map((r) => {
              const badHex = !HEX.test(r.color);
              const badIcon = !isKnownIcon(r.icon);
              return (
                <tr key={r.action_key}>
                  <td>
                    <span className="font-medium">{r.label}</span>
                    <div className="font-mono text-[11px] text-muted-foreground">{r.action_key}</div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label={`${r.label} colour`}
                        value={HEX.test(r.color) ? r.color : ACTION_DEFAULTS[r.action_key].color}
                        onChange={(e) => set(r.action_key, { color: e.target.value })}
                        className="h-8 w-10 shrink-0 cursor-pointer rounded border border-input bg-card"
                      />
                      <input
                        className="input font-mono text-xs"
                        aria-label={`${r.label} colour hex`}
                        aria-invalid={badHex || undefined}
                        value={r.color}
                        onChange={(e) => set(r.action_key, { color: e.target.value })}
                      />
                    </div>
                    {badHex && <p className="mt-1 text-xs text-destructive">Use a 6-digit hex, e.g. #dc2626</p>}
                  </td>
                  <td>
                    <input
                      className="input font-mono text-xs"
                      aria-label={`${r.label} icon`}
                      aria-invalid={badIcon || undefined}
                      value={r.icon}
                      onChange={(e) => set(r.action_key, { icon: e.target.value })}
                    />
                    {badIcon && (
                      <p className="mt-1 text-xs text-destructive">
                        Unknown icon — try {ACTION_DEFAULTS[r.action_key].icon}
                      </p>
                    )}
                  </td>
                  <td>
                    {/* Rendered from the row being edited, not from the saved
                        tokens, so the operator sees the pairing before saving. */}
                    <span
                      className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm"
                      style={{ backgroundColor: HEX.test(r.color) ? r.color : ACTION_DEFAULTS[r.action_key].color }}
                    >
                      <ActionIcon action={r.action_key} name={r.icon} className="h-4 w-4" />
                      {r.label}
                    </span>
                  </td>
                  <td className="text-right">
                    <button type="button" onClick={() => resetRow(r.action_key)} className="btn-secondary btn-sm">
                      Reset
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </section>
  );
}
