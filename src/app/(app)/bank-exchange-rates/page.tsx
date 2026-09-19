'use client';

// Daily bank exchange rate board (§2 — the rate the Fiche de Calcul and the
// invoices convert CDF against).
//
// The screen is one row of entry over one row of comparison: pick the day and
// the currency, type the Banque Centrale du Congo reference, then type what each
// exchange bank quoted. The board scores itself as you type — a bank beating the
// BCC reference turns green, the best of the day is badged — because the reason
// an operator opens this page is to decide which bank to change money with, and
// doing that arithmetic in their head across five columns is where the mistake
// lives. `compareBoard` in [exchangeRates.ts](src/lib/exchangeRates.ts) owns that
// rule and is unit-tested; nothing here re-derives it (§4.10).
//
// Below it, the same data pivoted into history: one row per date, one column per
// bank, so a bank's behaviour reads down a column and a day reads across.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Eraser,
  RefreshCw,
  Save,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import SearchableSelect from '@/components/ui/SearchableSelect';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { formatDate, formatDateTime, todayIso } from '@/lib/formatDate';
import { safeFetchJson } from '@/lib/safeFetch';
import { fetchMasterOptions } from '@/lib/selectOptions';
import {
  compareBoard,
  formatDelta,
  formatRate,
  highestQuote,
  rateDifference,
  toRate,
} from '@/lib/exchangeRates';

interface BoardBank {
  bank_id: number;
  bank_name: string | null;
  bank_code: string | null;
  bank_rate: string | null;
  rate_id: number | null;
  updated_at: string | null;
}

interface Board {
  exchange_date: string;
  currency_id: number;
  bcc_rate: string | null;
  banks: BoardBank[];
  /** The day's comparison, resolved by the server (see bankExchangeRates.ts). */
  highest_bank_id: number;
  highest_bank_rate: number;
  prev_bcc_rate: number;
  prev_bcc_date: string | null;
  rate_difference: number;
}

interface HistoryBank {
  id: number;
  bank_name: string | null;
  bank_code: string | null;
}

interface HistoryRow {
  exchange_date: string;
  bcc_rate: string | null;
  updated_at: string | null;
  rates: Record<number, string | null>;
  highest_bank_id: number | null;
  highest_bank_rate: string | null;
  prev_bcc_rate: string | null;
  prev_bcc_date: string | null;
  rate_difference: string | null;
}

/** A rate cell's value while it is being typed — keyed by bank id. */
type Draft = Record<number, string>;

/**
 * The history grid's `Updated` stamp: `DD-MM HH:mm`.
 *
 * Shortened because the column is the narrowest on a grid that is already as
 * wide as the bank list — §4.19 allows the abbreviated form for exactly this,
 * and it stays day-first so it cannot be read as a US date. The year is the one
 * thing dropped, and the row's own Date column carries it.
 *
 * Built on `formatDateTime` rather than re-deriving the parts, so the separator
 * and the ordering come from the one implementation (§4.10).
 */
function formatUpdatedStamp(value: string | null): string {
  const full = formatDateTime(value, '');
  if (!full) return '';
  // `DD-MM-YYYY HH:mm` → `DD-MM HH:mm`.
  const m = /^(\d{2}-\d{2})-\d{4}( .+)$/.exec(full);
  return m ? `${m[1]}${m[2]}` : full;
}

export default function BankExchangeRatesPage() {
  /**
   * Empty until mounted, and that is deliberate.
   *
   * `todayIso()` reads the LOCAL calendar day, so it answers with the server's
   * day during SSR and the browser's during hydration — different strings
   * whenever the two are in different timezones, which is a hydration mismatch
   * on the date input and on everything derived from it. Nothing here may depend
   * on the clock or on fetched data until the client is running.
   */
  const [date, setDate] = useState('');
  const [today, setToday] = useState('');
  const [mounted, setMounted] = useState(false);
  const [currencyId, setCurrencyId] = useState('');
  const [currencies, setCurrencies] = useState<{ value: string; label: string }[]>([]);

  const [board, setBoard] = useState<Board | null>(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const [bcc, setBcc] = useState('');
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  /**
   * What the BCC box is currently showing and where it came from.
   *
   * The caption is the whole value of the lookup button: a number that appeared
   * in a field is indistinguishable from one somebody typed, and the two are
   * answerable to different people. `from e-MCF` / `DGI (2026-09-17)` says the
   * rate is the published one; the refusal message says it is not and why
   * (§4.23), rather than leaving the box silently empty.
   */
  const [bccNote, setBccNote] = useState('');
  const [bccFetching, setBccFetching] = useState(false);

  /**
   * The history day the board was opened from, or null when it is showing today.
   *
   * Editing a past day is just the board pointed at another date — there is no
   * separate edit screen — but that is invisible once the page has scrolled, and
   * an operator who then types today's rates into September's board has no way to
   * tell. The badge says which day is open and Cancel goes back to today.
   */
  const [editDay, setEditDay] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyBanks, setHistoryBanks] = useState<HistoryBank[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');

  // §4.22 — the acknowledged outcome of every save and delete.
  const [result, setResult] = useState<SaveResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HistoryRow | null>(null);
  const [clearAsk, setClearAsk] = useState(false);

  // The clock, read once the client owns the render (see `date` above). There is
  // no purely-derived form of "the browser's today" — setState-in-effect is the
  // canonical React idiom for it, same as `usePagedList`'s own `mounted` flag.
  useEffect(() => {
    const t = todayIso();
    /* eslint-disable react-hooks/set-state-in-effect */
    setToday(t);
    setDate((prev) => prev || t);
    setMounted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // ---- Currencies --------------------------------------------------------
  // Only the dropdown's options. WHICH one to open on is the server's call —
  // see loadBoard: hardcoding CDF here opened an empty board over an empty
  // history on a database whose rates are all quoted in USD, which reads as a
  // screen that failed rather than as a currency nobody quotes.
  useEffect(() => {
    let live = true;
    void (async () => {
      const rows = await fetchMasterOptions('currencies', 'currency_short_name');
      if (!live) return;
      setCurrencies(rows.map((o) => ({ value: String(o.id), label: o.label })));
    })();
    return () => {
      live = false;
    };
  }, []);

  // ---- The day's board ---------------------------------------------------
  const loadBoard = useCallback(async () => {
    if (!date) return;
    setBoardLoading(true);
    try {
      // No currency on the first load: the route answers with the one that
      // actually carries rates, and we adopt it.
      const res = await safeFetchJson<Board>(
        `/api/v1/bank-exchange-rates/board?date=${date}${
          currencyId ? `&currency_id=${currencyId}` : ''
        }`,
      );
      if (!res.ok) {
        setResult({ status: 'error', title: 'Not loaded', message: res.message });
        return;
      }
      setBoard(res.data);
      // Adopting it re-runs this effect once with the currency pinned; the
      // guard stops it there rather than ping-ponging.
      if (!currencyId) setCurrencyId(String(res.data.currency_id));
      const stored = res.data.bcc_rate && Number(res.data.bcc_rate) > 0
        ? Number(res.data.bcc_rate).toFixed(2)
        : '';
      setBcc(stored);
      // The loaded value is whatever was saved, so the provenance caption from a
      // previous lookup no longer describes it.
      setBccNote('');
      const next: Draft = {};
      for (const b of res.data.banks) {
        const r = toRate(b.bank_rate);
        next[b.bank_id] = r === null ? '' : r.toFixed(2);
      }
      setDraft(next);
    } finally {
      setBoardLoading(false);
    }
  }, [currencyId, date]);


  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBoard();
  }, [loadBoard]);

  // ---- History -----------------------------------------------------------
  const loadHistory = useCallback(async () => {
    if (!currencyId) return;
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        currency_id: currencyId,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('q', search);
      const res = await safeFetchJson<{ banks: HistoryBank[]; items: HistoryRow[] }>(
        `/api/v1/bank-exchange-rates/history?${params}`,
      );
      if (!res.ok) {
        setResult({ status: 'error', title: 'Not loaded', message: res.message });
        return;
      }
      setHistoryBanks(res.data.banks);
      setHistory(res.data.items);
      setHistoryTotal(Number(res.meta?.total ?? 0));
    } finally {
      setHistoryLoading(false);
    }
  }, [currencyId, page, pageSize, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHistory();
  }, [loadHistory]);

  const currencyLabel = currencies.find((c) => c.value === currencyId)?.label ?? '';

  // ---- The comparison ----------------------------------------------------
  const verdict = useMemo(
    () =>
      compareBoard(
        toRate(bcc),
        (board?.banks ?? []).map((b) => ({ bankId: b.bank_id, rate: toRate(draft[b.bank_id]) })),
      ),
    [bcc, draft, board],
  );

  const bestBank = useMemo(() => {
    if (verdict.bestRate === null) return null;
    return (board?.banks ?? []).find((b) => verdict.byBank.get(b.bank_id)?.best) ?? null;
  }, [verdict, board]);

  /**
   * The Highest / Diff pair, recomputed from what is in the boxes RIGHT NOW.
   *
   * Live rather than read from the loaded board, because the reference screen
   * updates both the moment a rate is typed — that immediate feedback is the
   * whole point of the two columns, and a figure that only moved after Save
   * would be telling the operator about the previous board.
   *
   * `highestQuote`'s rule (strictly-greater, blanks are not quotes) is the
   * server's, so the green here and the stored winner cannot disagree (§4.10).
   */
  const liveHighest = useMemo(
    () =>
      highestQuote(
        (board?.banks ?? []).map((b) => ({
          bank_id: b.bank_id,
          bank_rate: toRate(draft[b.bank_id]) ?? 0,
        })),
      ),
    [board, draft],
  );

  const highestBankName = useMemo(
    () =>
      (board?.banks ?? []).find((b) => b.bank_id === liveHighest.bank_id)?.bank_name ?? null,
    [board, liveHighest],
  );

  /**
   * The previous day's BCC reference, and the gap the day's best bank leaves
   * against it. Both come from the server's answer for this date, so "previous"
   * means the same thing on the board as it does in the stored history column.
   */
  const prevBcc = board?.prev_bcc_rate ?? 0;
  const liveDiff = prevBcc > 0 ? rateDifference(liveHighest.rate, prevBcc) : null;

  /**
   * Ask DGI what the BCC published, and fill the box with it.
   *
   * `force=1` because a click means "look again" — the cache is there to spare
   * the round trip on a page load, not to answer a deliberate refresh. The route
   * answers with a rate or with a sentence saying why there is none; neither is
   * an error, and neither may overwrite a rate the operator already typed with
   * a blank.
   */
  async function lookupBcc() {
    if (!date || !currencyLabel) return;
    setBccFetching(true);
    try {
      const res = await safeFetchJson<{
        rate: number | null;
        source: string | null;
        date: string;
        cached: boolean;
        message?: string;
      }>(
        `/api/v1/bank-exchange-rates/bcc?currency=${encodeURIComponent(currencyLabel)}&date=${date}&force=1`,
      );
      if (!res.ok) {
        setBccNote(res.message);
        return;
      }
      if (res.data.rate === null) {
        setBccNote(res.data.message ?? `No published ${currencyLabel} rate for this day.`);
        return;
      }
      setBcc(res.data.rate.toFixed(2));
      setBccNote(`from ${res.data.source ?? 'DGI'}`);
    } finally {
      setBccFetching(false);
    }
  }

  /** Open a history day on the board above, where it can be corrected and re-saved. */
  function editHistoryDay(row: HistoryRow) {
    setDate(row.exchange_date);
    setEditDay(row.exchange_date);
    // Without this the click looks like it did nothing: the board it just
    // changed is a screen's worth of scrolling away.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save() {
    if (!board) return;
    const rates = Object.entries(draft)
      .map(([bankId, v]) => ({ bank_id: Number(bankId), bank_rate: toRate(v) }))
      .filter((r): r is { bank_id: number; bank_rate: number } => r.bank_rate !== null);

    // Checked before the round trip so the message names the field the same way
    // the server would (§4.23).
    if (toRate(bcc) === null) {
      setResult({
        status: 'error',
        title: 'Not saved',
        message: 'BCC Rate is required and must be greater than 0 — it is the reference every bank is compared against.',
      });
      return;
    }
    if (rates.length === 0) {
      setResult({
        status: 'error',
        title: 'Not saved',
        message: 'Enter a rate for at least one bank before saving the board.',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await safeFetchJson<{ created: number; updated: number }>(
        '/api/v1/bank-exchange-rates/board',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exchange_date: date,
            currency_id: Number(currencyId),
            bcc_rate: Number(bcc),
            rates,
          }),
        },
      );
      if (!res.ok) {
        setResult({ status: 'error', title: 'Not saved', message: res.message });
        return;
      }
      const { created, updated } = res.data;
      setResult({
        status: 'success',
        title: 'Saved',
        message: `${currencyLabel} rates for ${formatDate(date)} have been saved — ${created} new, ${updated} updated.`,
      });
      void loadBoard();
      void loadHistory();
    } finally {
      setSaving(false);
    }
  }

  async function removeDay(row: HistoryRow) {
    const res = await safeFetchJson<{ removed: number }>(
      `/api/v1/bank-exchange-rates/board?exchange_date=${row.exchange_date}&currency_id=${currencyId}`,
      { method: 'DELETE' },
    );
    setConfirmDelete(null);
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: res.message });
      return;
    }
    setResult({
      status: 'success',
      title: 'Deleted',
      message: `The ${currencyLabel} rates for ${formatDate(row.exchange_date)} have been removed from the board.`,
    });
    void loadHistory();
    if (row.exchange_date === date) void loadBoard();
  }

  const exportHref = `/api/v1/bank-exchange-rates/export?currency_id=${currencyId}${
    search ? `&q=${encodeURIComponent(search)}` : ''
  }`;

  // History columns: the fixed three, then one per exchange bank, then meta.
  const historyColumns: DataTableColumn<HistoryRow>[] = [
    {
      key: 'exchange_date',
      header: 'Date',
      sortable: true,
      className: 'font-medium whitespace-nowrap',
      render: (r) => formatDate(r.exchange_date),
    },
    {
      key: 'currency',
      header: 'Currency',
      align: 'center',
      render: () => (
        <span className="inline-block rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
          {currencyLabel || '—'}
        </span>
      ),
    },
    {
      key: 'bcc_rate',
      header: 'BCC Rate',
      align: 'right',
      sortable: true,
      className: 'font-mono',
      render: (r) => <span className="font-semibold">{formatRate(toRate(r.bcc_rate))}</span>,
    },
    ...historyBanks.map<DataTableColumn<HistoryRow>>((b) => ({
      key: `bank_${b.id}`,
      header: (b.bank_name ?? `Bank ${b.id}`).toUpperCase(),
      align: 'right',
      className: 'font-mono',
      // Sort and search this column on its own number, not on the row object.
      value: (r) => toRate(r.rates[b.id]) ?? '',
      render: (r) => {
        const rate = toRate(r.rates[b.id]);
        const reference = toRate(r.bcc_rate);
        const beats = rate !== null && reference !== null && rate > reference;
        // Two greens, the same pair the board uses: beating the BCC reference is
        // worth knowing, but the day's WINNER is what the row is scanned for, so
        // it carries the stronger mark.
        const isHighest = r.highest_bank_id !== null && r.highest_bank_id === b.id;
        return (
          <span
            className={
              isHighest
                ? 'rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-200'
                : beats
                  ? 'rounded px-1.5 py-0.5 font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'text-muted-foreground'
            }
          >
            {formatRate(rate)}
          </span>
        );
      },
    })),
    {
      key: 'highest',
      header: 'Highest',
      align: 'right',
      className: 'font-mono whitespace-nowrap',
      // Sorted and searched on the winning NUMBER — the bank's name is the
      // caption underneath, and sorting a column of names by rate would surprise.
      value: (r) => toRate(r.highest_bank_rate) ?? '',
      render: (r) => {
        const rate = toRate(r.highest_bank_rate);
        if (rate === null) return <span className="text-muted-foreground">—</span>;
        const bank = historyBanks.find((b) => b.id === r.highest_bank_id);
        return (
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">
            {formatRate(rate)}
            {bank?.bank_name && (
              <span className="ms-1 text-[10px] font-normal uppercase text-muted-foreground">
                {bank.bank_name}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'prev_bcc_rate',
      header: 'Prev BCC',
      align: 'right',
      className: 'font-mono text-muted-foreground',
      value: (r) => toRate(r.prev_bcc_rate) ?? '',
      // The date it was published rides as the tooltip: the column is narrow and
      // the number is what the difference beside it was measured against.
      render: (r) => (
        <span title={r.prev_bcc_date ? formatDate(r.prev_bcc_date) : undefined}>
          {formatRate(toRate(r.prev_bcc_rate))}
        </span>
      ),
    },
    {
      key: 'rate_difference',
      header: 'Diff',
      align: 'right',
      className: 'font-mono whitespace-nowrap',
      value: (r) => (r.rate_difference === null ? '' : Number(r.rate_difference)),
      render: (r) => {
        // Not `toRate`: that treats 0 and negatives as "not entered", which is
        // right for a rate and wrong for a difference — a day that moved DOWN
        // must show as a fall, not as a blank.
        if (r.rate_difference === null) return <span className="text-muted-foreground">—</span>;
        const diff = Number(r.rate_difference);
        if (!Number.isFinite(diff) || diff === 0) {
          return <span className="text-muted-foreground">{formatRate(0)}</span>;
        }
        const up = diff > 0;
        return (
          <span
            className={`inline-flex items-center gap-1 font-semibold ${
              up ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
            }`}
          >
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {formatDelta(diff)}
          </span>
        );
      },
    },
    {
      key: 'updated_at',
      header: 'Updated',
      className: 'text-xs text-muted-foreground whitespace-nowrap',
      // DD-MM HH:mm, as the reference screen shows it. §4.19 sanctions the
      // shortened form where a full date will not fit; it is still day-first, so
      // it cannot be misread as a US date.
      render: (r) => formatUpdatedStamp(r.updated_at),
    },
  ];

  return (
    <>
      <div className="card p-4 mb-4">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <TrendingUp className="h-5 w-5 text-primary-600" /> Bank Exchange Rates
        </h1>
      </div>

      {/* ---- The day's board ------------------------------------------- */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-foreground">Bank Exchange Rate Management</h2>
            {editDay && editDay === date && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                Editing {formatDate(editDay)}
                <button
                  type="button"
                  onClick={() => {
                    setEditDay(null);
                    setDate(today);
                  }}
                  aria-label="Stop editing this day and go back to today"
                  title="Back to today"
                  className="rounded-full p-0.5 hover:bg-amber-500/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {currencyLabel ? `${currencyLabel} per unit — ` : ''}a bank above the BCC reference is
            worth changing money with, so it shows green.
          </p>
        </div>

        {/* The board is client-fetched data read at a client-owned clock, so the
            server has no honest snapshot of it. Rendering the real grid during SSR
            made the server and the first client paint disagree — the Save button
            carried `disabled` on one side and not the other, which is the hydration
            mismatch React reported. Both sides render this skeleton instead, and the
            live board replaces it once the client owns the tree. */}
        {!mounted ? (
          <div className="space-y-2 p-4" aria-hidden="true">
            <div className="h-9 animate-pulse rounded bg-muted" />
            <div className="h-16 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="border border-border px-3 py-2 text-left font-semibold" style={{ minWidth: 160 }}>
                    Date
                  </th>
                  <th className="border border-border px-3 py-2 text-left font-semibold" style={{ minWidth: 130 }}>
                    Currency
                  </th>
                  <th className="border border-border px-3 py-2 text-left font-semibold" style={{ minWidth: 140 }}>
                    BCC Rate
                  </th>
                  {(board?.banks ?? []).map((b) => (
                    <th
                      key={b.bank_id}
                      className="border border-border px-3 py-2 text-left font-semibold"
                      style={{ minWidth: 150 }}
                      title={b.bank_name ?? undefined}
                    >
                      <span className="block truncate">{(b.bank_name ?? `Bank ${b.bank_id}`).toUpperCase()}</span>
                    </th>
                  ))}
                  {/* The two answers the operator came for, at the end of the row
                      they are computed from — which bank to use, and whether the
                      day has moved since the last published reference. */}
                  <th className="border border-border px-3 py-2 text-left font-semibold" style={{ minWidth: 150 }}>
                    Highest
                  </th>
                  <th className="border border-border px-3 py-2 text-left font-semibold" style={{ minWidth: 160 }}>
                    Diff vs Prev BCC
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-border p-2 align-top">
                    <label htmlFor="exchange-date" className="sr-only">
                      Exchange date
                    </label>
                    {/* Fed and read as ISO; the DD-MM-YYYY form is for reading (§4.19).
                        `max` blocks a future day — a rate that has not been published. */}
                    <input
                      id="exchange-date"
                      type="date"
                      required
                      className="input min-w-0"
                      value={date}
                      max={today || undefined}
                      onChange={(e) => {
                        setDate(e.target.value);
                        // Picked by hand, so the board is no longer the history
                        // row it was opened from.
                        setEditDay(null);
                      }}
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(date)}</p>
                  </td>

                  <td className="border border-border p-2 align-top">
                    <SearchableSelect
                      aria-label="Currency"
                      value={currencyId}
                      options={currencies}
                      placeholder="Currency"
                      onChange={(v) => {
                        setCurrencyId(v);
                        setPage(1);
                      }}
                    />
                  </td>

                  <td className="border border-border p-2 align-top">
                    <label htmlFor="bcc-rate" className="sr-only">
                      BCC rate
                    </label>
                    {/* §4.36 — `min-w-0` on the input, `shrink-0` on the button:
                        an <input>'s intrinsic minimum is ~20 characters, so
                        without it the pair widens the whole column. */}
                    <div className="flex items-center gap-1">
                      <input
                        id="bcc-rate"
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        placeholder="0.00"
                        aria-invalid={bcc !== '' && toRate(bcc) === null}
                        className={`input min-w-0 flex-1 text-right font-mono font-semibold ${
                          verdict.bccIsBest && toRate(bcc) !== null
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                            : ''
                        }`}
                        value={bcc}
                        onChange={(e) => {
                          setBcc(e.target.value);
                          // Typed over, so it is no longer the published figure.
                          setBccNote('');
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void lookupBcc()}
                        disabled={bccFetching || !currencyLabel}
                        title={`Fetch the published ${currencyLabel || ''} rate for this day`.trim()}
                        aria-label="Fetch the published BCC rate for this day"
                        className="btn-neutral btn-icon shrink-0 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${bccFetching ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground" title={bccNote || undefined}>
                      {bccNote ||
                        (verdict.bccIsBest && toRate(bcc) !== null ? 'Best on the board' : 'Reference')}
                    </p>
                  </td>

                  {(board?.banks ?? []).map((b) => {
                    const v = verdict.byBank.get(b.bank_id);
                    return (
                      <td key={b.bank_id} className="border border-border p-2 align-top">
                        <label htmlFor={`bank-rate-${b.bank_id}`} className="sr-only">
                          {b.bank_name ?? `Bank ${b.bank_id}`} rate
                        </label>
                        <input
                          id={`bank-rate-${b.bank_id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          // Two different greens, deliberately: a bank BEATING
                          // the BCC reference is worth using, but the day's
                          // HIGHEST is the one the operator is looking for, so
                          // it is the stronger mark (the reference screen's
                          // `is-highest`).
                          className={`input min-w-0 text-right font-mono ${
                            liveHighest.bank_id === b.bank_id
                              ? 'border-2 border-emerald-600 bg-emerald-100 font-bold text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-200'
                              : v?.beatsBcc
                                ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                                : ''
                          }`}
                          value={draft[b.bank_id] ?? ''}
                          onChange={(e) => setDraft((prev) => ({ ...prev, [b.bank_id]: e.target.value }))}
                        />
                        <p className="mt-1 flex items-center gap-1 text-[11px]">
                          {v?.best && (
                            <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                              Best
                            </span>
                          )}
                          {v?.delta != null && v.delta !== 0 && (
                            <span
                              className={
                                v.delta > 0
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-muted-foreground'
                              }
                            >
                              {formatDelta(v.delta)} vs BCC
                            </span>
                          )}
                        </p>
                      </td>
                    );
                  })}

                  {/* Recomputed from the boxes as they are typed, not read back
                      from the loaded board: the reason to watch this cell is to
                      see the winner change while entering rates, and a figure
                      that only moved after Save would describe the last board. */}
                  <td className="border border-border p-2 align-top">
                    {liveHighest.bank_id > 0 ? (
                      <>
                        <p className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">
                          {formatRate(liveHighest.rate)}
                        </p>
                        <p
                          className="mt-1 truncate text-[11px] text-muted-foreground"
                          title={highestBankName ?? undefined}
                        >
                          {(highestBankName ?? `Bank ${liveHighest.bank_id}`).toUpperCase()}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-mono text-sm text-muted-foreground">—</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">No rate entered</p>
                      </>
                    )}
                  </td>

                  <td className="border border-border p-2 align-top">
                    {liveDiff === null || liveHighest.rate <= 0 ? (
                      <p className="font-mono text-sm text-muted-foreground">—</p>
                    ) : (
                      <p
                        className={`flex items-center gap-1 font-mono text-sm font-semibold ${
                          liveDiff > 0
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : liveDiff < 0
                              ? 'text-red-700 dark:text-red-300'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {liveDiff > 0 ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : liveDiff < 0 ? (
                          <TrendingDown className="h-3.5 w-3.5" />
                        ) : null}
                        {formatDelta(liveDiff) || formatRate(0)}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {prevBcc > 0
                        ? `Prev BCC ${formatRate(prevBcc)}${
                            board?.prev_bcc_date ? ` · ${formatDate(board.prev_bcc_date)}` : ''
                          }`
                        : 'No earlier BCC on file'}
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {boardLoading
                ? 'Loading…'
                : bestBank && verdict.bestRate !== null
                  ? `Best today: ${(bestBank.bank_name ?? '').toUpperCase()} at ${formatRate(verdict.bestRate)}${
                      verdict.byBank.get(bestBank.bank_id)?.delta
                        ? ` (${formatDelta(verdict.byBank.get(bestBank.bank_id)?.delta ?? null)} vs BCC)`
                        : ''
                    }`
                  : 'Enter the BCC reference and each bank’s rate to compare them.'}
            </p>
            {/* Every action on the board, in one bar, ending on Save — the row
                above is for values. Save last because it is the one that
                commits, and the one the operator reaches for by position. */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadBoard()}
                disabled={boardLoading}
                className="btn-neutral btn-sm disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${boardLoading ? 'animate-spin' : ''}`} /> Load Rate
              </button>
              <button type="button" onClick={() => setClearAsk(true)} className="btn-secondary btn-sm">
                <Eraser className="h-4 w-4" /> Clear
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || boardLoading || !board}
                // §4.26 — `btn-save` reads --action-save from
                // action_style_master_t, so this colour is an admin's row edit
                // under Settings → Application rather than a hex pinned here.
                className="btn-save btn-sm disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          </>
        )}
      </div>

      {/* ---- History ---------------------------------------------------- */}
      <DataTable<HistoryRow>
        rows={history}
        loading={historyLoading}
        rowKey={(r) => r.exchange_date}
        title="Exchange Rate History"
        // §4.25 — the export belongs to the list it exports.
        exportHref={exportHref}
        searchPlaceholder="Search date (30-06-2026)..."
        // Names the currency, because an empty grid here almost always means
        // "nothing quoted in THIS currency", not "nothing on file" (§4.25).
        emptyMessage={
          currencyLabel
            ? `No ${currencyLabel} rates on file yet — enter a day above and save it.`
            : 'No rates on file yet — enter a day above and save it.'
        }
        columns={historyColumns}
        // Edit opens the day on the board above — there is no second screen, and
        // correcting a mis-typed rate is the reason anybody looks at this grid.
        // Delete stays beside it: it is the only way to take a day off the board
        // (§4.27), and the reference screen having only Edit is not a reason to
        // remove a working capability.
        actions={(r) => ({
          edit: () => editHistoryDay(r),
          remove: () => setConfirmDelete(r),
        })}
        server={{
          page,
          pageSize,
          total: historyTotal,
          onPageChange: setPage,
          onPageSizeChange: (n) => {
            setPageSize(n);
            setPage(1);
          },
          search,
          onSearchChange: (q) => {
            setSearch(q);
            setPage(1);
          },
        }}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Remove this day?"
        confirmLabel="Remove"
        tone="danger"
        icon={<Trash2 className="h-5 w-5" />}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void removeDay(confirmDelete)}
      >
        {confirmDelete && (
          <>
            Every {currencyLabel} rate recorded for{' '}
            <strong className="text-foreground">{formatDate(confirmDelete.exchange_date)}</strong> will be
            taken off the board. It stays on file for anything already converted at it, and the day can be
            entered again.
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={clearAsk}
        title="Clear the entered rates?"
        confirmLabel="Clear"
        onCancel={() => setClearAsk(false)}
        onConfirm={() => {
          setBcc('');
          setDraft({});
          setClearAsk(false);
        }}
      >
        This empties the BCC reference and every bank cell above. Nothing saved is affected — reload the
        day to bring the stored rates back.
      </ConfirmDialog>

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
