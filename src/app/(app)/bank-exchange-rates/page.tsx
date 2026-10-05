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
  Edit2,
  Eraser,
  Eye,
  Save,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatDate, formatDateTime, todayIso } from '@/lib/formatDate';
import { safeFetchJson } from '@/lib/safeFetch';
import { fetchMasterOptions } from '@/lib/selectOptions';
import {
  compareBoard,
  gainAtBestRate,
  formatDelta,
  formatMoney,
  formatRate,
  highestQuote,
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

/**
 * ADD-ON — the day's reference rates from `exchange_rate_master_t`.
 *
 * Both figures are nullable: the route answers for any day, and "nothing filed
 * for this one" is an answer rather than an error (§4.23).
 */
interface DayRates {
  id: number | null;
  rate_date: string;
  currency_id: number;
  declaration_rate: string | null;
  bcc_rate: string | null;
}

interface Board {
  exchange_date: string;
  currency_id: number;
  bcc_rate: string | null;
  /** The amount the day was saved with (0134). */
  exchanged_amount: string | null;
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
  exchanged_amount: string | null;
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
  // ADD-ON — the day's reference rates (Declaration + BCC) from the Exchange
  // Rate master, and the converter's amount box. Both are additions beside the
  // existing board; neither changes how a day is entered or saved.
  const [dayRates, setDayRates] = useState<DayRates | null>(null);
  const [exchangedAmount, setExchangedAmount] = useState('');
  /** The history day open in the read-only viewer, or null. */
  const [viewDay, setViewDay] = useState<HistoryRow | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  /**
   * Where the BCC box's figure came from, as a caption under it.
   *
   * The box is read-only, so an empty one has to say why rather than reading as
   * a field somebody forgot to fill (§4.23): `from Exchange Rate master` when
   * the day has a filed rate, and a sentence naming the master when it does not.
   */
  const [bccNote, setBccNote] = useState('');

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
  // see loadBoard. It answers CDF, the currency the banks are quoted against,
  // and falls back to the most recently quoted one when CDF is not in the
  // master, so the screen never opens on a currency that cannot exist.
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

      // ADD-ON — the day's reference rates from the Exchange Rate master.
      //
      // Fetched HERE rather than in an effect of its own so the two values are
      // in hand together: deciding whether to prefill from one of two
      // independent async results is a race, and the losing order would
      // overwrite a saved rate.
      const ref = await safeFetchJson<DayRates>(
        `/api/v1/exchange-rates/for-day?date=${date}&currency_id=${
          currencyId || res.data.currency_id
        }`,
      );
      const masterBcc = ref.ok ? toRate(ref.data.bcc_rate) : null;
      setDayRates(ref.ok ? ref.data : null);

      // The amount the day was saved with, so reloading a day brings back the
      // figure its margin was calculated on rather than an empty box.
      setExchangedAmount(
        res.data.exchanged_amount !== null && Number(res.data.exchanged_amount) > 0
          ? String(Number(res.data.exchanged_amount))
          : '',
      );

      // A SAVED rate always wins. The master only fills the box when the day
      // has none — otherwise editing the master later would silently rewrite
      // what a board was saved with, and the invoices quoted against it would
      // no longer match their own day.
      if (stored) {
        setBcc(stored);
        // The loaded value is whatever was saved, so the provenance caption
        // from a previous lookup no longer describes it.
        setBccNote('');
      } else if (masterBcc !== null) {
        setBcc(masterBcc.toFixed(2));
        setBccNote('from Exchange Rate master');
      } else {
        setBcc('');
        setBccNote('');
      }
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


  // ADD-ON — what the day's best bank rate is worth against the BCC.
  //
  // Reads `liveHighest` and the BCC box as typed, so the figure follows the
  // grid rather than a stale saved value (§4.10 — one rule for "the day's best
  // rate", not two).
  const gain = useMemo(
    () =>
      gainAtBestRate(
        exchangedAmount,
        liveHighest.rate > 0 ? liveHighest.rate : null,
        toRate(bcc),
      ),
    [exchangedAmount, liveHighest, bcc],
  );

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
            // Empty stays NULL rather than becoming 0 — "nobody entered an
            // amount" and "the amount was zero" are different facts.
            exchanged_amount: exchangedAmount === '' ? null : Number(exchangedAmount),
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
    // Currency, Highest and Prev BCC are no longer columns here. The grid
    // already shows every bank's rate with the day's best one tinted, and all
    // three still read in the row's View dialog, where there is room for them.
    {
      key: 'exchanged_amount',
      header: 'Exchanged',
      align: 'right',
      className: 'font-mono whitespace-nowrap',
      // Sorted on the number, not the formatted string, so 1,000 does not fall
      // between 100 and 20 (§4.19's note that <DataTable> sorts the field).
      value: (r) => (r.exchanged_amount === null ? '' : Number(r.exchanged_amount)),
      render: (r) =>
        r.exchanged_amount === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          formatMoney(Number(r.exchanged_amount))
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
                  <th className="border border-border px-3 py-2 text-left font-semibold" style={{ minWidth: 140 }}>
                    BCC Rate
                  </th>
                  {/* Beside the BCC because both are the day's filed references,
                      read from the Exchange Rate master rather than typed here. */}
                  <th className="border border-border px-3 py-2 text-left font-semibold" style={{ minWidth: 150 }}>
                    Declaration Rate
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
                  {/* The converter ends the row: it reads the best rate the
                      cells to its left produced, so it is the last thing the
                      operator fills and the last thing they read. */}
                  <th className="border border-border px-3 py-2 text-left font-semibold" style={{ minWidth: 150 }}>
                    Exchanged Amount
                  </th>
                  <th className="border border-border px-3 py-2 text-left font-semibold" style={{ minWidth: 170 }}>
                    Value in USD
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
                  </td>

                  <td className="border border-border p-2 align-top">
                    <label htmlFor="bcc-rate" className="sr-only">
                      BCC rate
                    </label>
                    {/* READ-ONLY. The BCC is the day's published reference and
                        belongs to the day, not to this screen — it is entered
                        once in the Exchange Rate master, and typing it again
                        here is how the same figure came to disagree with itself
                        across a day's rows.
                        `readOnly`, not `disabled`: a disabled input is skipped
                        by the browser and drops out of the form, and the value
                        still has to save with the day (§4.18's note that a
                        read-only field keeps submitting).
                        §4.36 — `min-w-0`, because an <input>'s intrinsic
                        minimum is ~20 characters and would widen the column. */}
                    <input
                      id="bcc-rate"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      readOnly
                      placeholder="0.00"
                      aria-invalid={bcc !== '' && toRate(bcc) === null}
                      title="Set in the Exchange Rate master"
                      className={`input w-full min-w-0 cursor-default text-right font-mono font-semibold ${
                        verdict.bccIsBest && toRate(bcc) !== null
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                          : 'bg-muted/40'
                      }`}
                      value={bcc}
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground" title={bccNote || undefined}>
                      {bccNote ||
                        (verdict.bccIsBest && toRate(bcc) !== null ? 'Best on the board' : 'Reference')}
                    </p>
                  </td>

                  <td className="border border-border p-2 align-top">
                    <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {formatRate(toRate(dayRates?.declaration_rate))}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {/* Says WHY it is empty rather than leaving a dash to be read as
                          a rate of nothing (§4.23). */}
                      {toRate(dayRates?.declaration_rate) !== null
                        ? 'From the Exchange Rate master'
                        : `No rate filed for ${currencyLabel || 'this currency'} on ${formatDate(date)}`}
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

                  <td className="border border-border p-2 align-top">
                    <label htmlFor="exchanged-amount" className="sr-only">
                      Exchanged amount
                    </label>
                    <input
                      id="exchanged-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      className="input min-w-0 text-right font-mono"
                      placeholder="0.00"
                      value={exchangedAmount}
                      onChange={(e) => setExchangedAmount(e.target.value)}
                    />
                  </td>

                  <td className="border border-border p-2 align-top">
                    <p
                      className={`font-mono text-sm font-semibold tabular-nums ${
                        gain.value === null
                          ? 'text-foreground'
                          : gain.value > 0
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : gain.value < 0
                              ? 'text-red-700 dark:text-red-300'
                              : 'text-muted-foreground'
                      }`}
                    >
                      {gain.value === null ? '—' : `$${formatMoney(gain.value)}`}
                    </p>
                    {/* Only the figure once there is one. An em dash on its own
                        reads as a screen that failed, so a cell that CANNOT be
                        computed still says which input is missing (§4.23). */}
                    {gain.value === null && (
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">
                        {gain.bestRate === null
                          ? 'No bank has quoted yet today'
                          : gain.bccRate === null
                            ? 'No BCC reference for this day'
                            : 'Enter an amount'}
                      </p>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              
            </p>
            {/* Every action on the board, in one bar, ending on Save — the row
                above is for values. Save last because it is the one that
                commits, and the one the operator reaches for by position. */}
            <div className="flex flex-wrap items-center gap-2">
              {/* No manual "Load Rate": the board already reloads whenever the
                  date or currency changes, so the button only ever repeated
                  what had just happened. */}
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
        // View opens the day read-only — the whole board for that date in one
        // dialog, which the grid cannot show: a history row is one line per day
        // with a column per bank, so a day with eight banks is read by scrolling
        // sideways. Edit still loads it onto the board above for correcting.
        actions={(r) => ({
          view: () => setViewDay(r),
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

      {viewDay && (
        <DayViewModal
          day={viewDay}
          banks={board?.banks ?? []}
          currencyLabel={currencyLabel}
          onClose={() => setViewDay(null)}
          onEdit={() => {
            editHistoryDay(viewDay);
            setViewDay(null);
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

/**
 * One day's board, read-only.
 *
 * Its own component rather than <RecordViewModal>: that one renders a
 * METADATA page from `master_page_t`, and the rate board has no page config —
 * it is a pivot of one table, not a form. Reusing it would mean inventing page
 * metadata for a screen that does not have any.
 *
 * It still reads like the rest of the app: the brand-gradient header, the same
 * accent chip, the same cell treatment, and a labelled way out (§4.21).
 */
function DayViewModal({
  day,
  banks,
  currencyLabel,
  onClose,
  onEdit,
}: {
  day: HistoryRow;
  banks: BoardBank[];
  currencyLabel: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  // Escape closes, as every other modal in the app does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const bcc = toRate(day.bcc_rate);
  const best = toRate(day.highest_bank_rate);
  const diff = toRate(day.rate_difference);
  const prev = toRate(day.prev_bcc_rate);

  // The same helper the board uses, so the two can never disagree about what
  // the figure means (§4.10). Every input is the DAY's own saved row — amount,
  // best rate and BCC — so an older day is read exactly as it was filed rather
  // than re-valued at today's numbers.
  const gain = useMemo(
    () => gainAtBestRate(day.exchanged_amount, best, bcc),
    [day.exchanged_amount, best, bcc],
  );

  // The day's quotes, best first — a read-only view is SCANNED, so the answer
  // belongs at the top rather than wherever the bank happens to sort.
  const quotes = banks
    .map((b) => ({ ...b, rate: toRate(day.rates[b.bank_id]) }))
    .filter((b) => b.rate !== null)
    .sort((a, z) => (z.rate ?? 0) - (a.rate ?? 0));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="card my-auto flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 bg-brand-gradient px-5 py-4 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
              <Eye className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold leading-tight">Exchange Rates</h2>
              <p className="mt-0.5 truncate text-xs text-white/75">
                {formatDate(day.exchange_date)}
                {currencyLabel ? ` · ${currencyLabel}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-white/90 transition-colors hover:bg-white/20 hover:text-white"
            title="Close"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'BCC Reference', value: formatRate(bcc) },
              { label: 'Best Bank Rate', value: formatRate(best) },
              {
                label: 'Vs Previous BCC',
                value: diff === null ? '—' : formatDelta(diff) || formatRate(0),
              },
              {
                label: 'Previous BCC',
                value:
                  prev === null
                    ? '—'
                    : `${formatRate(prev)}${day.prev_bcc_date ? ` · ${formatDate(day.prev_bcc_date)}` : ''}`,
              },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border-l-2 border-border bg-muted/30 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </dt>
                <dd className="mt-1 font-mono text-sm font-medium tabular-nums text-foreground">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">Bank</th>
                  <th className="px-3 py-2 text-right font-semibold">Rate</th>
                  <th className="px-3 py-2 text-right font-semibold">Vs BCC</th>
                </tr>
              </thead>
              <tbody>
                {quotes.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No bank quoted on this day.
                    </td>
                  </tr>
                ) : (
                  quotes.map((b) => {
                    const delta = bcc !== null && b.rate !== null ? b.rate - bcc : null;
                    const isBest = b.bank_id === day.highest_bank_id;
                    return (
                      <tr key={b.bank_id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <span className="font-medium text-foreground">
                            {(b.bank_name ?? `Bank ${b.bank_id}`).toUpperCase()}
                          </span>
                          {/* §4.38 — the day's winner is a badge, not bold text,
                              so it reads at a glance like every other status. */}
                          {isBest && <StatusBadge status="Best" tone="emerald" />}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                          {formatRate(b.rate)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono tabular-nums ${
                            delta === null
                              ? 'text-muted-foreground'
                              : delta > 0
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : delta < 0
                                  ? 'text-red-700 dark:text-red-300'
                                  : 'text-muted-foreground'
                          }`}
                        >
                          {delta === null ? '—' : formatDelta(delta) || formatRate(0)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* The same calculation the board carries, scoped to THIS day.
              The amount is not stored — it is a question asked of a day's
              rates, not a property of them — so the box starts empty and the
              figures come from the day's own saved best rate and BCC rather
              than from whatever the board above currently holds. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border-l-2 border-border bg-muted/30 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Exchanged Amount
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                {gain.amount === null ? '—' : formatMoney(gain.amount)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {gain.amount === null ? 'No amount saved for this day' : 'Saved with this day'}
              </p>
            </div>

            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Value in USD
              </p>
              <p
                className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
                  gain.value === null
                    ? 'text-foreground'
                    : gain.value > 0
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : gain.value < 0
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-muted-foreground'
                }`}
              >
                {gain.value === null ? '—' : `$${formatMoney(gain.value)}`}
              </p>
              {gain.value === null && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {gain.bestRate === null
                    ? 'No bank quoted on this day'
                    : gain.bccRate === null
                      ? 'No BCC reference on this day'
                      : 'No amount saved for this day'}
                </p>
              )}
            </div>
          </div>

          {day.updated_at && (
            <p className="text-xs text-muted-foreground">
              Last updated {formatDateTime(day.updated_at, '')}
            </p>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-card px-5 py-3">
          <button type="button" onClick={onEdit} className="btn-edit btn-sm">
            <Edit2 className="h-4 w-4" /> Edit on the board
          </button>
          {/* §4.21 — a labelled way out, always. */}
          <button type="button" onClick={onClose} className="btn-secondary">
            <X className="h-4 w-4" /> Close
          </button>
        </div>
      </div>
    </div>
  );
}
