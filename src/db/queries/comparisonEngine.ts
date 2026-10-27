import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clientMaster } from '@/db/schema';
import { formatDate } from '@/lib/formatDate';
import type { ComparedSlice, ComparisonResult, MetricDef, MonthPoint } from '@/lib/comparison';
import type { ComparisonQuery } from '@/schemas/comparison';

// §4.29 — the engine behind the Client, Licence and Tracking comparison
// dashboards.
//
// A comparison is a set of SLICES measured with the same metrics: two periods,
// up to five clients, import against export, or up to five offices. The engine
// turns a request into slices and measures them; a module (clients, licences,
// tracking) only says WHAT to measure for one slice. That split is the point —
// twelve comparisons (three dashboards × four modes) are written as three
// metric definitions and one engine, not twelve copies (§4.10).

/** One slice's scope. Every field narrows; an absent one does not. */
export interface SliceFilter {
  /** Inclusive ISO dates — the window the slice is measured over. */
  from: string;
  to: string;
  clientId?: number;
  /** One of the module's own direction keys ('import' / 'export'). */
  direction?: string;
  officeId?: number;
}

export interface ComparisonModule {
  metrics: MetricDef[];
  /** The metric charted, and the one top clients / offices are ranked by. */
  headline: string;
  /** What this module's office dimension is called on screen. */
  officeLabel: string;
  /** The direction split this module supports — empty means it has none. */
  directions: Array<{ key: string; label: string }>;
  offices(): Promise<Array<{ id: number; label: string }>>;
  measure(filter: SliceFilter): Promise<Record<string, number | null>>;
  /** The headline metric per calendar month inside `filter.from..to`. */
  monthly(filter: SliceFilter): Promise<MonthPoint[]>;
  /** Ids ranked by the headline metric over the window — the auto-pick. */
  topClients(from: string, to: string, n: number): Promise<number[]>;
  topOffices(from: string, to: string, n: number): Promise<number[]>;
}

const AUTO_PICK = 3;

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The windows a request leaves out. A comparison over "the last twelve months"
 * by default, and — for period mode — this year so far against the same
 * stretch of last year, which is the comparison an operator asks for first.
 */
export function defaultWindows(today = new Date()): { from: string; to: string; a: [string, string]; b: [string, string] } {
  const to = iso(today);
  const from = iso(new Date(today.getFullYear(), today.getMonth() - 11, 1));
  const yearStart = iso(new Date(today.getFullYear(), 0, 1));
  const lastYearStart = iso(new Date(today.getFullYear() - 1, 0, 1));
  const lastYearSameDay = iso(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
  return { from, to, a: [yearStart, to], b: [lastYearStart, lastYearSameDay] };
}

const span = (from: string, to: string): string => `${formatDate(from)} – ${formatDate(to)}`;

async function clientLabels(ids: number[]): Promise<Map<number, { short: string; name: string }>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: clientMaster.id, short: clientMaster.shortName, name: clientMaster.companyName })
    .from(clientMaster)
    .where(inArray(clientMaster.id, ids));
  return new Map(rows.map((r) => [r.id, { short: r.short ?? `Client #${r.id}`, name: r.name ?? '' }]));
}

async function measured(mod: ComparisonModule, key: string, label: string, detail: string, f: SliceFilter): Promise<ComparedSlice> {
  const [values, monthly] = await Promise.all([mod.measure(f), mod.monthly(f)]);
  return { key, label, detail, values, monthly };
}

export async function runComparison(mod: ComparisonModule, q: ComparisonQuery, mode: string): Promise<ComparisonResult> {
  const d = defaultWindows();
  const from = q.from ?? d.from;
  const to = q.to ?? d.to;
  const offices = await mod.offices();
  const available = { offices, officeLabel: mod.officeLabel, directions: mod.directions };
  let autoPicked: string | undefined;
  let slices: ComparedSlice[] = [];

  if (q.mode === 'period') {
    const a: [string, string] = [q.a_from ?? d.a[0], q.a_to ?? d.a[1]];
    const b: [string, string] = [q.b_from ?? d.b[0], q.b_to ?? d.b[1]];
    slices = await Promise.all([
      measured(mod, 'a', 'Period A', span(...a), { from: a[0], to: a[1] }),
      measured(mod, 'b', 'Period B', span(...b), { from: b[0], to: b[1] }),
    ]);
  } else if (q.mode === 'client') {
    let ids = q.client_ids;
    if (ids.length === 0) {
      ids = await mod.topClients(from, to, AUTO_PICK);
      if (ids.length > 0) autoPicked = `The ${ids.length} busiest clients in this range — add or remove clients to change the comparison.`;
    }
    const labels = await clientLabels(ids);
    slices = await Promise.all(
      ids.map((id) =>
        measured(mod, `client-${id}`, labels.get(id)?.short ?? `Client #${id}`, labels.get(id)?.name ?? '', {
          from,
          to,
          clientId: id,
        }),
      ),
    );
  } else if (q.mode === 'direction') {
    slices = await Promise.all(
      mod.directions.map((dir) => measured(mod, dir.key, dir.label, span(from, to), { from, to, direction: dir.key })),
    );
  } else {
    let ids = q.office_ids;
    if (ids.length === 0) {
      ids = await mod.topOffices(from, to, AUTO_PICK);
      if (ids.length > 0) autoPicked = `The ${ids.length} busiest ${mod.officeLabel.toLowerCase()}s in this range — add or remove to change the comparison.`;
    }
    const names = new Map(offices.map((o) => [o.id, o.label]));
    slices = await Promise.all(
      ids.map((id) =>
        measured(mod, `office-${id}`, names.get(id) ?? `${mod.officeLabel} #${id}`, span(from, to), { from, to, officeId: id }),
      ),
    );
  }

  return { mode, metrics: mod.metrics, headline: mod.headline, slices, available, ...(autoPicked ? { autoPicked } : {}) };
}
