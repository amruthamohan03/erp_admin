'use client';

import * as React from 'react';
import { Calculator, ChevronRight, RefreshCw } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';

// Fiche de Calcul per §2 step 3 — duties / taxes / fees calculator. Free-
// form: the user enters a base amount, picks which tax_rule_master_t
// formulas to compose, and gets a structured breakdown back. Composes
// purely via /api/v1/fiche-de-calcul/calculate; no state is persisted on
// the server. A follow-up slice can pin this to a tracking row via a
// tracking_calculation_t table.

interface TaxRule {
  id: number;
  ruleKey: string;
  name: string;
  description: string | null;
  jurisdiction: string | null;
  scope: string | null;
  displayOrder: number;
}

interface FicheLine {
  ruleKey: string;
  name: string;
  scope: string | null;
  value: number | null;
  error?: string;
}

interface FicheResult {
  asOf: string;
  lines: FicheLine[];
  total: number;
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function FicheDeCalculPage() {
  const [rules, setRules] = React.useState<TaxRule[]>([]);
  const [rulesLoading, setRulesLoading] = React.useState(true);
  const [rulesError, setRulesError] = React.useState<string | null>(null);

  const [amount, setAmount] = React.useState<string>('');
  const [asOf, setAsOf] = React.useState<string>('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const [calculating, setCalculating] = React.useState(false);
  const [calcError, setCalcError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<FicheResult | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/tax-rules');
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setRulesError(json.error?.message ?? 'Failed to load rules');
          return;
        }
        setRules(json.data);
      } catch {
        if (!cancelled) setRulesError('Network error loading rules');
      } finally {
        if (!cancelled) setRulesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleRule(ruleKey: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ruleKey)) next.delete(ruleKey);
      else next.add(ruleKey);
      return next;
    });
    setResult(null);
  }

  async function calculate(e: React.FormEvent) {
    e.preventDefault();
    setCalcError(null);
    setResult(null);

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setCalcError('Amount must be a non-negative number');
      return;
    }
    if (selected.size === 0) {
      setCalcError('Pick at least one rule');
      return;
    }

    setCalculating(true);
    try {
      const body: Record<string, unknown> = {
        entity: { amount: parsedAmount },
        ruleKeys: Array.from(selected),
      };
      if (asOf) body.asOf = asOf;
      const res = await fetch('/api/v1/fiche-de-calcul/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setCalcError(json.error?.message ?? 'Calculation failed');
        return;
      }
      setResult(json.data);
    } catch {
      setCalcError('Network error');
    } finally {
      setCalculating(false);
    }
  }

  function reset() {
    setAmount('');
    setAsOf('');
    setSelected(new Set());
    setResult(null);
    setCalcError(null);
  }

  // Group rules by scope so the picker reads like the natural calculation
  // breakdown — duties → VAT → fees etc. Rules without a scope land last.
  const rulesByScope = React.useMemo(() => {
    const groups = new Map<string, TaxRule[]>();
    for (const r of rules) {
      const key = r.scope ?? '_other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === '_other') return 1;
      if (b === '_other') return -1;
      return a.localeCompare(b);
    });
  }, [rules]);

  return (
    <DashboardShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary-600" />
            Fiche de Calcul
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Compose <code>tax_rule_master_t</code> formulas to compute duties,
            taxes, and fees on a base amount. Pure read; nothing is persisted.
          </p>
        </div>
        <Button variant="outline" onClick={reset} disabled={calculating}>
          <RefreshCw className="h-4 w-4 mr-2" /> Reset
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={calculate} className="card p-6 space-y-4">
          <div>
            <label className="label" htmlFor="fiche-amount">
              Base amount
            </label>
            <input
              id="fiche-amount"
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 10000"
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              Passed to every selected rule as <code>entity.amount</code>.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="fiche-asof">
              Rates as of (optional)
            </label>
            <input
              id="fiche-asof"
              type="date"
              className="input"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
            <p className="text-xs text-slate-500 mt-1">
              Pin to a historical date for recalculations. Defaults to today
              server-side.
            </p>
          </div>

          <div>
            <div className="label">Rules</div>
            {rulesLoading && (
              <div className="text-sm text-slate-500">Loading rules…</div>
            )}
            {rulesError && (
              <div className="rounded-md bg-red-50 p-2 text-xs text-red-700 border border-red-200">
                {rulesError}
              </div>
            )}
            {!rulesLoading && !rulesError && rules.length === 0 && (
              <div className="text-sm text-slate-500">
                No rules seeded. Run <code>npm run db:seed</code>.
              </div>
            )}
            <div className="space-y-3 mt-2">
              {rulesByScope.map(([scope, scopeRules]) => (
                <div key={scope}>
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                    {scope === '_other' ? 'Other' : scope}
                  </div>
                  <div className="space-y-1">
                    {scopeRules.map((r) => (
                      <label
                        key={r.ruleKey}
                        className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 mt-0.5"
                          checked={selected.has(r.ruleKey)}
                          onChange={() => toggleRule(r.ruleKey)}
                        />
                        <div className="flex-1 text-sm">
                          <div className="font-medium text-slate-900">
                            {r.name}
                          </div>
                          {r.description && (
                            <div className="text-xs text-slate-500">
                              {r.description}
                            </div>
                          )}
                          <div className="text-xs text-slate-400 mt-0.5">
                            <code>{r.ruleKey}</code>
                            {r.jurisdiction && ` · ${r.jurisdiction}`}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {calcError && (
            <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">
              {calcError}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={calculating}>
              {calculating ? 'Calculating…' : 'Calculate'}
              {!calculating && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </form>

        <div className="card p-6">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">
            Breakdown
          </div>
          {!result && (
            <div className="text-sm text-slate-500">
              Pick rules and click <strong>Calculate</strong> to see the
              breakdown here.
            </div>
          )}
          {result && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500">
                Rates as of <code>{result.asOf}</code>
              </div>
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Scope</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((l) => (
                    <tr key={l.ruleKey}>
                      <td>
                        <div className="text-sm">{l.name}</div>
                        <code className="text-xs text-slate-400">
                          {l.ruleKey}
                        </code>
                        {l.error && (
                          <div className="text-xs text-red-600 mt-0.5">
                            {l.error}
                          </div>
                        )}
                      </td>
                      <td className="text-xs text-slate-500">
                        {l.scope ?? '—'}
                      </td>
                      <td className="text-right font-mono">
                        {l.value == null ? '—' : fmtMoney(l.value)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold border-t-2 border-slate-300">
                    <td colSpan={2}>Total</td>
                    <td className="text-right font-mono">
                      {fmtMoney(result.total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
