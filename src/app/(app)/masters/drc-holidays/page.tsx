'use client';

// DRC public holidays master (§4.1).
//
// Not a decorative list: `getHolidaySet` reads these rows to exclude non-working
// days from the Import and Export delay KPIs, so adding or retiring one moves
// every processing-time figure those dashboards report. That is exactly why the
// DRC's movable feasts belong in a master an operator maintains each year rather
// than in a constant somebody has to redeploy.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, List, Plus, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { formatDate, isWeekend, toDateInputValue, weekdayName } from '@/lib/formatDate';
import { safeFetchJson } from '@/lib/safeFetch';
import {
  buildMonthGrid,
  MONTH_NAMES,
  todayLocalIso,
  WEEKDAY_HEADINGS,
} from '@/lib/calendarMonth';

type HolidayType = 'fixed' | 'variable';

interface Row {
  id: number;
  holiday_date: string;
  name_en: string;
  name_fr: string | null;
  holiday_type: HolidayType;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

const TYPE_LABEL: Record<HolidayType, string> = {
  fixed: 'Fixed',
  variable: 'Variable',
};

const TYPE_STYLE: Record<HolidayType, string> = {
  // Semantic hues carry both themes explicitly — they have no token (§4.32).
  fixed: 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30',
  variable:
    'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
};

export default function DrcHolidaysPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(false);
  /**
   * Calendar first: a holiday calendar is read by looking at the year, and the
   * list is what you switch to in order to search or bulk-check. Both are the
   * same rows — the calendar is a second view, not a second source (§4.10).
   */
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  /**
   * The create modal's seed date, or null when closed. A string (possibly empty)
   * rather than a boolean because clicking an empty day on the calendar opens
   * the form already on that date — which is most of the reason to click a day.
   */
  const [createAt, setCreateAt] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set('q', search);
      if (year) params.set('year', year);
      if (type) params.set('holiday_type', type);

      const res = await safeFetchJson<Row[]>(`/api/v1/drc-holidays?${params}`);
      if (res.ok) {
        setItems(res.data);
        setTotal(Number(res.meta?.total ?? 0));
      } else {
        setResult({ status: 'error', title: 'Not loaded', message: res.message });
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, year, type]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // ---- Calendar view -----------------------------------------------------
  // Its own fetch, because the calendar needs a whole year at once while the
  // table is paged (§4.9). 100 is the schema's page cap and comfortably above
  // the ~30 holidays a year can hold.
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [yearRows, setYearRows] = useState<Row[]>([]);
  const [yearLoading, setYearLoading] = useState(false);

  const loadYear = useCallback(async () => {
    setYearLoading(true);
    try {
      const res = await safeFetchJson<Row[]>(`/api/v1/drc-holidays?year=${calendarYear}&pageSize=100`);
      if (res.ok) setYearRows(res.data);
      else setResult({ status: 'error', title: 'Not loaded', message: res.message });
    } finally {
      setYearLoading(false);
    }
  }, [calendarYear]);

  useEffect(() => {
    if (view !== 'calendar') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadYear();
  }, [view, loadYear]);

  /** Both views read the same rows, so a write refreshes whichever is mounted. */
  const refresh = useCallback(() => {
    load();
    if (view === 'calendar') loadYear();
  }, [load, loadYear, view]);

  /** A window around today — far enough back to audit, far enough on to plan. */
  const yearOptions = useMemo(() => {
    const now = new Date().getUTCFullYear();
    const years: { value: string; label: string }[] = [];
    for (let y = now + 2; y >= now - 3; y -= 1) years.push({ value: String(y), label: String(y) });
    return years;
  }, []);

  async function handleDelete(row: Row) {
    // §4.22 — a question before a destructive action is still allowed; the
    // RESULT of it is what must go through the dialog.
    if (!confirm(`Remove "${row.name_en}" (${formatDate(row.holiday_date)}) from the holiday calendar?`)) return;

    const res = await safeFetchJson<{ id: number }>(`/api/v1/drc-holidays/${row.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: res.message });
      return;
    }
    setResult({
      status: 'success',
      title: 'Deleted',
      // Say what it costs elsewhere: this is not an inert list.
      message: `"${row.name_en}" has been removed. Delay KPIs will now count ${formatDate(row.holiday_date)} as a working day.`,
    });
    refresh();
  }

  return (
    <>
      <div className="card p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary-600" /> DRC Public Holidays
        </h1>

        {/* One set of rows, two ways to read it: the calendar to see the year,
            the list to search and page through it (§4.9). */}
        <div className="inline-flex overflow-hidden rounded-md border border-border" role="group" aria-label="View">
          <button
            type="button"
            onClick={() => setView('calendar')}
            aria-pressed={view === 'calendar'}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm ${
              view === 'calendar'
                ? 'bg-primary-600 text-white'
                : 'bg-card text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <CalendarDays className="h-4 w-4" /> Calendar
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            className={`inline-flex items-center gap-1.5 border-s border-border px-3 py-1.5 text-sm ${
              view === 'list'
                ? 'bg-primary-600 text-white'
                : 'bg-card text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <List className="h-4 w-4" /> List
          </button>
        </div>
      </div>

      {view === 'calendar' ? (
        <HolidayCalendar
          year={calendarYear}
          rows={yearRows}
          loading={yearLoading}
          yearOptions={yearOptions}
          onYearChange={setCalendarYear}
          onPick={(row) => setEditing(row)}
          onAddAt={(iso) => setCreateAt(iso)}
          onAdd={() => setCreateAt('')}
        />
      ) : (
      <DataTable<Row>
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        title="Holiday Calendar"
        searchPlaceholder="Search holiday name (English or French)..."
        emptyMessage="No holidays recorded for this filter — add the first one."
        filters={
          <>
            <SearchableSelect
              size="sm"
              className="w-32"
              aria-label="Year"
              value={year}
              options={yearOptions}
              emptyLabel="All Years"
              placeholder="All Years"
              onChange={(v) => {
                setYear(v);
                setPage(1);
              }}
            />
            <SearchableSelect
              size="sm"
              className="w-36"
              aria-label="Holiday type"
              value={type}
              options={[
                { value: 'fixed', label: 'Fixed' },
                { value: 'variable', label: 'Variable' },
              ]}
              emptyLabel="All Types"
              placeholder="All Types"
              onChange={(v) => {
                setType(v);
                setPage(1);
              }}
            />
          </>
        }
        toolbar={
          // §4.35 — the create action belongs to the list it adds to.
          <button type="button" onClick={() => setCreateAt('')} className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Holiday
          </button>
        }
        columns={[
          {
            key: 'holiday_date',
            header: 'Date',
            className: 'font-medium',
            // §4.19 — DD-MM-YYYY through the shared formatter, never inline.
            render: (r: Row) => formatDate(r.holiday_date),
          },
          {
            key: 'weekday',
            header: 'Day',
            className: 'text-xs',
            render: (r: Row) => (
              <span className={isWeekend(r.holiday_date) ? 'text-muted-foreground' : 'text-foreground'}>
                {weekdayName(r.holiday_date)}
                {/* A holiday on a weekend is already a non-working day, so it
                    changes no delay figure. Worth saying, or someone will add it
                    and wonder why nothing moved. */}
                {isWeekend(r.holiday_date) && ' · weekend'}
              </span>
            ),
          },
          { key: 'name_en', header: 'Name (English)', className: 'font-medium' },
          {
            key: 'name_fr',
            header: 'Name (French)',
            render: (r: Row) => r.name_fr || '—',
          },
          {
            key: 'holiday_type',
            header: 'Type',
            align: 'center',
            render: (r: Row) => (
              <span
                className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${TYPE_STYLE[r.holiday_type]}`}
              >
                {TYPE_LABEL[r.holiday_type]}
              </span>
            ),
          },
        ]}
        actions={(r) => ({ edit: () => setEditing(r), remove: () => handleDelete(r) })}
        server={{
          page,
          pageSize,
          total,
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
      )}

      {createAt !== null && (
        <FormModal
          defaultDate={createAt}
          onClose={() => setCreateAt(null)}
          onSaved={() => {
            setCreateAt(null);
            refresh();
            setResult({ status: 'success', title: 'Created', message: 'The holiday has been added to the calendar.' });
          }}
        />
      )}

      {editing && (
        <FormModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this holiday have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function FormModal({
  row,
  defaultDate,
  onClose,
  onSaved,
}: {
  row?: Row;
  /** Pre-filled date when the form was opened from a calendar day. */
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!row;
  const [date, setDate] = useState(row ? toDateInputValue(row.holiday_date) : (defaultDate ?? ''));
  const [nameEn, setNameEn] = useState(row?.name_en ?? '');
  const [nameFr, setNameFr] = useState(row?.name_fr ?? '');
  const [type, setType] = useState<HolidayType>(row?.holiday_type ?? 'fixed');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await safeFetchJson<{ id: number }>(
        isEdit ? `/api/v1/drc-holidays/${row!.id}` : '/api/v1/drc-holidays',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            holiday_date: date,
            name_en: nameEn,
            name_fr: nameFr.trim() || null,
            holiday_type: type,
          }),
        },
      );
      if (!res.ok) {
        // §4.23 — the server names the field and the fix (a clashing date says
        // which holiday already holds it); only fall back if it said nothing.
        setError(res.message || 'This holiday could not be saved.');
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold text-foreground">{isEdit ? 'Edit Holiday' : 'New Holiday'}</h2>
          <button type="button" onClick={onClose} title="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3 p-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="holiday-date" className="label required">Date</label>
            {/* Fed and read as ISO — a date input renders blank on anything else
                (§4.19). The DD-MM-YYYY form is for reading, in the table. */}
            <input
              id="holiday-date"
              type="date"
              required
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {date && isWeekend(date) && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                {weekdayName(date)} is already a non-working day, so this will not change any delay figure.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="holiday-name-en" className="label required">Name (English)</label>
            <input
              id="holiday-name-en"
              required
              maxLength={150}
              className="input"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="Independence Day"
            />
          </div>

          <div>
            <label htmlFor="holiday-name-fr" className="label">Name (French)</label>
            <input
              id="holiday-name-fr"
              maxLength={150}
              className="input"
              value={nameFr}
              onChange={(e) => setNameFr(e.target.value)}
              placeholder="Fete de l'Independance"
            />
          </div>

          <div>
            <label htmlFor="holiday-type" className="label required">Type</label>
            <SearchableSelect
              id="holiday-type"
              required
              aria-label="Holiday type"
              value={type}
              options={[
                { value: 'fixed', label: 'Fixed — same date every year' },
                { value: 'variable', label: 'Variable — moves each year' },
              ]}
              onChange={(v) => setType(v as HolidayType)}
            />
          </div>

          {/* §4.21 — a labelled way out, in every mode. */}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Calendar view --------------------------------------------------------

/**
 * A year at a glance, twelve months, holidays in red.
 *
 * The grid arithmetic lives in [calendarMonth.ts](src/lib/calendarMonth.ts) and
 * is unit-tested — leap years, the year boundary in the padding, and the 1-based
 * month are all places a hand-rolled calendar goes wrong by one day.
 */
function HolidayCalendar({
  year,
  rows,
  loading,
  yearOptions,
  onYearChange,
  onPick,
  onAddAt,
  onAdd,
}: {
  year: number;
  rows: Row[];
  loading: boolean;
  yearOptions: { value: string; label: string }[];
  onYearChange: (y: number) => void;
  onPick: (row: Row) => void;
  onAddAt: (iso: string) => void;
  onAdd: () => void;
}) {
  // Keyed by ISO date — the same string the grid emits, so the lookup is exact
  // rather than a date comparison that could drift a day.
  const byDate = useMemo(() => new Map(rows.map((r) => [r.holiday_date, r])), [rows]);
  const today = todayLocalIso();

  const onWeekend = rows.filter((r) => isWeekend(r.holiday_date)).length;

  return (
    <div className="card p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchableSelect
            size="sm"
            className="w-28"
            aria-label="Calendar year"
            value={String(year)}
            options={yearOptions}
            onChange={(v) => onYearChange(Number(v))}
          />
          <span className="text-sm text-muted-foreground">
            {loading ? (
              'Loading…'
            ) : (
              <>
                <strong className="text-foreground">{rows.length}</strong>{' '}
                {rows.length === 1 ? 'holiday' : 'holidays'} in {year}
                {/* A holiday on a Saturday or Sunday is already a non-working
                    day, so it moves no delay figure. Saying how many keeps the
                    count from looking wrong against the KPI. */}
                {onWeekend > 0 && ` · ${onWeekend} on a weekend, which changes no delay figure`}
              </>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Legend — the colours mean something, so they are named. */}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-3 w-3 rounded-sm bg-red-600" /> Public holiday
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-3 w-3 rounded-sm bg-muted" /> Weekend
          </span>
          <button type="button" onClick={onAdd} className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Holiday
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {MONTH_NAMES.map((monthName, i) => (
          <MonthCard
            key={monthName}
            year={year}
            month={i + 1}
            monthName={monthName}
            byDate={byDate}
            today={today}
            onPick={onPick}
            onAddAt={onAddAt}
          />
        ))}
      </div>
    </div>
  );
}

function MonthCard({
  year,
  month,
  monthName,
  byDate,
  today,
  onPick,
  onAddAt,
}: {
  year: number;
  month: number;
  monthName: string;
  byDate: Map<string, Row>;
  today: string;
  onPick: (row: Row) => void;
  onAddAt: (iso: string) => void;
}) {
  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const count = weeks.flat().filter((d) => d.inMonth && byDate.has(d.iso)).length;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">{monthName}</h3>
        {count > 0 && (
          <span className="text-[11px] font-medium text-red-700 dark:text-red-400">
            {count} {count === 1 ? 'holiday' : 'holidays'}
          </span>
        )}
      </div>

      <table className="w-full table-fixed border-collapse text-center text-xs">
        <thead>
          <tr>
            {WEEKDAY_HEADINGS.map((d) => (
              <th key={d} scope="col" className="pb-1 font-medium text-muted-foreground">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0].iso}>
              {week.map((cell) => {
                const holiday = cell.inMonth ? byDate.get(cell.iso) : undefined;

                if (!cell.inMonth) {
                  // Padding from a neighbouring month — shown faintly for shape,
                  // never interactive and never coloured.
                  return (
                    <td key={cell.iso} className="p-0.5">
                      <span className="block rounded py-1 text-muted-foreground/40">{cell.day}</span>
                    </td>
                  );
                }

                const isToday = cell.iso === today;
                // A solid mid-tone red reads on either theme's ground, so it
                // needs no dark: twin (§4.32).
                const tone = holiday
                  ? 'bg-red-600 text-white font-semibold hover:bg-red-700'
                  : cell.weekend
                    ? 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    : 'text-foreground hover:bg-muted/50';

                return (
                  <td key={cell.iso} className="p-0.5">
                    <button
                      type="button"
                      onClick={() => (holiday ? onPick(holiday) : onAddAt(cell.iso))}
                      title={
                        holiday
                          ? `${formatDate(cell.iso)} — ${holiday.name_en}${holiday.name_fr ? ` / ${holiday.name_fr}` : ''}${
                              cell.weekend ? ' (weekend — changes no delay figure)' : ''
                            }`
                          : `Add a holiday on ${formatDate(cell.iso)}`
                      }
                      aria-label={
                        holiday
                          ? `${holiday.name_en} on ${formatDate(cell.iso)}. Edit.`
                          : `Add a holiday on ${formatDate(cell.iso)}`
                      }
                      className={`block w-full rounded py-1 transition-colors ${tone} ${
                        isToday ? 'ring-2 ring-primary-500' : ''
                      }`}
                    >
                      {cell.day}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
