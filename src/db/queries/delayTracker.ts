import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { exportT, importT } from '@/db/schema';
import { getHolidaySet } from './imkpi';
import { formatDate } from '@/lib/formatDate';
import { CLEARING_STATUS, clearingStatusIn } from './clearingStatus';
import {
  dueMark,
  resolveDelay,
  tallyDelays,
  type DelayOutcome,
  type DelayRule,
  type DelayStatus,
  type DelayTally,
} from '@/lib/delayTracker/resolve';

// The Delay Tracker's data: which rule each file is measured by, and how it is
// doing against it.
//
// Nothing here decides what "late" means — that is `delay_rule_master_t`
// (§4.1). This loads the rules, reads the date columns they name, and hands
// both to the pure resolver. The same loader also feeds the two Delay KPI
// screens, so the stage definitions they chart and the ones this tracker
// measures are one set of rows rather than two copies in source (§4.10).

function rowsOf<R>(result: unknown): R[] {
  return (result as { rows?: R[] }).rows ?? [];
}

export type DelayModule = 'import' | 'export';

const TABLES = {
  import: importT,
  export: exportT,
} as const;

/** Every live rule for a module, newest-configured stage order preserved. */
export async function loadDelayRules(module: DelayModule): Promise<DelayRule[]> {
  const rules = rowsOf<{
    id: number;
    rule_key: string;
    name: string;
    transport_letter: string | null;
    start_field: string;
    end_field: string;
    target_days: number;
    day_basis: 'working' | 'calendar';
    notify_days_before: number[] | null;
    notify_overdue: boolean;
  }>(
    await db.execute(sql`
      SELECT id, rule_key, name, transport_letter, start_field, end_field,
             target_days, day_basis, notify_days_before, notify_overdue
        FROM delay_rule_master_t
       WHERE module = ${module} AND display = 'Y'
       ORDER BY transport_letter NULLS FIRST, id`),
  );
  if (rules.length === 0) return [];

  const stages = rowsOf<{
    rule_id: number;
    stage_key: string;
    label: string;
    short_label: string;
    from_field: string;
    to_field: string;
    target_days: number;
    priority: boolean;
    color: string;
    icon: string;
  }>(
    await db.execute(sql`
      SELECT rule_id, stage_key, label, short_label, from_field, to_field,
             target_days, priority, color, icon
        FROM delay_rule_stage_t
       WHERE display = 'Y'
         AND rule_id IN (${sql.join(rules.map((r) => sql`${r.id}`), sql`, `)})
       ORDER BY rule_id, sort_order, id`),
  );

  return rules.map((r) => ({
    id: r.id,
    key: r.rule_key,
    module,
    name: r.name,
    transportLetter: r.transport_letter,
    startField: r.start_field,
    endField: r.end_field,
    targetDays: r.target_days,
    dayBasis: r.day_basis,
    notifyDaysBefore: Array.isArray(r.notify_days_before) ? r.notify_days_before : [],
    notifyOverdue: r.notify_overdue,
    stages: stages
      .filter((s) => s.rule_id === r.id)
      .map((s) => ({
        key: s.stage_key,
        label: s.label,
        short: s.short_label,
        from: s.from_field,
        to: s.to_field,
        target: s.target_days,
        priority: s.priority,
        color: s.color,
        icon: s.icon,
      })),
  }));
}

/**
 * The rule a file takes: its transport mode's, else the module's default.
 *
 * A file with no transport mode set, or one nobody configured a rule for,
 * falls to the default rather than going unmeasured — an unmeasured file is
 * invisible on this screen, which is the opposite of what it is for.
 */
export function ruleForFile(rules: DelayRule[], transportLetter: string | null): DelayRule | null {
  if (rules.length === 0) return null;
  const specific = transportLetter
    ? rules.find((r) => r.transportLetter === transportLetter)
    : undefined;
  return specific ?? rules.find((r) => r.transportLetter === null) ?? null;
}

/** Every date column any rule in the set reads, as a deduplicated list. */
export function fieldsUsed(rules: DelayRule[]): string[] {
  const set = new Set<string>();
  for (const r of rules) {
    set.add(r.startField);
    set.add(r.endField);
    for (const s of r.stages) {
      set.add(s.from);
      set.add(s.to);
    }
  }
  return [...set];
}

export interface DelayRow {
  id: number;
  module: DelayModule;
  mca_ref: string | null;
  client_name: string | null;
  transport_mode: string | null;
  transport_letter: string | null;
  clearing_status: string | null;
  delay: DelayOutcome;
}

export interface DelayTrackerData {
  rows: DelayRow[];
  tally: DelayTally;
  /** The rules in play, so the screen can explain what it measured. */
  rules: Array<{
    key: string;
    name: string;
    transport_letter: string | null;
    start_field: string;
    end_field: string;
    target_days: number;
    basis: string;
  }>;
  today: string;
}

export interface DelayFilters {
  module?: DelayModule | undefined;
  client_id?: number | undefined;
  status?: DelayStatus | undefined;
  /** Hide files that already finished — the default, since this is a to-do list. */
  include_completed?: boolean | undefined;
}

/** The statuses that mean the file is off the desk. */
const DONE: readonly DelayStatus[] = ['completed_on_time', 'completed_late'];

async function loadModule(
  module: DelayModule,
  rules: DelayRule[],
  f: DelayFilters,
  holidays: Set<string>,
  today: string,
): Promise<DelayRow[]> {
  if (rules.length === 0) return [];
  const table = TABLES[module];
  const fields = fieldsUsed(rules);

  const conds: SQL[] = [sql`${table.display} = 'Y'`];
  if (f.client_id !== undefined) conds.push(sql`${table.clientId} = ${f.client_id}`);
  // A cancelled file is not late — nobody is working it. Leaving it in would
  // put a permanent red row at the top of a screen meant to be actioned.
  conds.push(
    sql`NOT (${clearingStatusIn(table.clearingStatus, [CLEARING_STATUS.cancelled])})`,
  );

  const rows = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      SELECT ${table.id} AS id,
             ${table.mcaRef} AS mca_ref,
             c.short_name AS client_name,
             tm.transport_mode_name AS transport_mode,
             tm.transport_letter AS transport_letter,
             cs.clearing_status AS clearing_status,
             ${sql.join(
               fields.map((name) => sql`${sql.identifier(name)}`),
               sql`, `,
             )}
        FROM ${table}
        LEFT JOIN client_master_t c ON c.id = ${table.clientId}
        LEFT JOIN transport_mode_master_t tm ON tm.id = ${table.transportMode}
        LEFT JOIN clearing_status_master_t cs ON cs.id = ${table.clearingStatus}
       WHERE ${sql.join(conds, sql` AND `)}
       ORDER BY ${table.id} DESC
       LIMIT 2000`),
  );

  return rows.flatMap((row) => {
    const letter = typeof row.transport_letter === 'string' ? row.transport_letter : null;
    const rule = ruleForFile(rules, letter);
    if (!rule) return [];
    return [
      {
        id: Number(row.id),
        module,
        mca_ref: (row.mca_ref as string | null) ?? null,
        client_name: (row.client_name as string | null) ?? null,
        transport_mode: (row.transport_mode as string | null) ?? null,
        transport_letter: letter,
        clearing_status: (row.clearing_status as string | null) ?? null,
        delay: resolveDelay(row, rule, holidays, today),
      },
    ];
  });
}

/** Today as the DATABASE sees it, so every open span is measured from one day. */
export async function todayFromDb(): Promise<string> {
  const [row] = rowsOf<{ today: string }>(
    await db.execute(sql`SELECT to_char(current_date, 'YYYY-MM-DD') AS today`),
  );
  return row?.today ?? new Date().toISOString().slice(0, 10);
}

export async function getDelayTracker(f: DelayFilters = {}): Promise<DelayTrackerData> {
  const holidays = await getHolidaySet();
  const today = await todayFromDb();
  const modules: DelayModule[] = f.module ? [f.module] : ['import', 'export'];

  const perModule = await Promise.all(
    modules.map(async (m) => {
      const rules = await loadDelayRules(m);
      return { module: m, rules, rows: await loadModule(m, rules, f, holidays, today) };
    }),
  );

  let rows = perModule.flatMap((p) => p.rows);
  if (!f.include_completed) rows = rows.filter((r) => !DONE.includes(r.delay.status));
  if (f.status) rows = rows.filter((r) => r.delay.status === f.status);

  // Worst first: an operator opens this to find what is already late, so the
  // row needing action is the one they should not have to sort for.
  const ORDER: Record<DelayStatus, number> = {
    overdue: 0,
    due_soon: 1,
    on_track: 2,
    not_started: 3,
    completed_late: 4,
    completed_on_time: 5,
  };
  rows.sort((a, b) => {
    const byStatus = ORDER[a.delay.status] - ORDER[b.delay.status];
    if (byStatus !== 0) return byStatus;
    return (a.delay.remaining_days ?? 1e9) - (b.delay.remaining_days ?? 1e9);
  });

  return {
    rows,
    tally: tallyDelays(rows.map((r) => r.delay)),
    rules: perModule.flatMap((p) =>
      p.rules.map((r) => ({
        key: r.key,
        name: r.name,
        transport_letter: r.transportLetter,
        start_field: r.startField,
        end_field: r.endField,
        target_days: r.targetDays,
        basis: r.dayBasis,
      })),
    ),
    today,
  };
}

// ===================================================================
// The notification sweep
// ===================================================================

export interface DelaySweepResult {
  checked: number;
  raised: number;
  /** Already announced at this mark on an earlier run. */
  skipped: number;
}

/**
 * Raise a notification for every file that has just crossed a mark.
 *
 * Which marks, and whether an overdue file is announced at all, is the rule's
 * own configuration; who hears about it and in what words is the event's row
 * in `notification_event_master_t` (§4.1). An event nobody is subscribed to
 * raises nothing, which is why this can run nightly without anyone's say-so.
 *
 * `delay_notice_log_t` is what stops it repeating itself. The mark is CLAIMED
 * before the event is raised, so two runners cannot both announce it; and the
 * claim is released again when nothing was actually announced, so marks passed
 * while no role was subscribed are given the moment somebody subscribes rather
 * than being silently spent.
 */
export async function sweepDelayNotices(): Promise<DelaySweepResult> {
  const { raiseEvent } = await import('./notifications');
  const holidays = await getHolidaySet();
  const today = await todayFromDb();
  const result: DelaySweepResult = { checked: 0, raised: 0, skipped: 0 };

  for (const mod of ['import', 'export'] as DelayModule[]) {
    const rules = await loadDelayRules(mod);
    if (rules.length === 0) continue;
    const rows = await loadModule(mod, rules, {}, holidays, today);

    for (const row of rows) {
      const rule = ruleForFile(rules, row.transport_letter);
      if (!rule) continue;
      result.checked += 1;

      const mark = dueMark(row.delay, rule);
      if (mark === null) continue;

      const raisedNow = await db.transaction(async (tx) => {
        // The log row is the claim. Taking it first means a second runner —
        // or a retry after a crash — finds the mark already claimed instead
        // of announcing it twice.
        const claim = await tx.execute(sql`
          INSERT INTO delay_notice_log_t (rule_id, module, record_id, days_mark)
          VALUES (${rule.id}, ${mod}, ${row.id}, ${mark})
          ON CONFLICT (module, record_id, rule_id, days_mark) DO NOTHING
          RETURNING id`);
        const claimed = rowsOf<{ id: number }>(claim)[0];
        if (!claimed) return false;

        const overdue = mark < 0;
        const notificationId = await raiseEvent(tx, overdue ? 'delay.overdue' : 'delay.due_soon', {
          actorUserId: null,
          context: {
            ref: row.mca_ref ?? `#${row.id}`,
            client: row.client_name ?? 'Unknown client',
            rule: rule.name,
            // §4.19 — a notification body is read by a person, so the date in
            // it is DD-MM-YYYY like every other date they see.
            due_date: formatDate(row.delay.due_date, ''),
            days_left: String(Math.max(0, row.delay.remaining_days ?? 0)),
            days_over: String(Math.abs(row.delay.remaining_days ?? 0)),
            basis: rule.dayBasis === 'working' ? 'working' : 'calendar',
            module: mod,
          },
        });

        // Nobody is subscribed to the event yet, so nothing was said. Release
        // the claim: holding it would spend the mark silently, and attaching a
        // role tomorrow would leave every already-late file quiet until it
        // happened to cross a different mark.
        if (notificationId === null) {
          await tx.execute(sql`DELETE FROM delay_notice_log_t WHERE id = ${claimed.id}`);
          return false;
        }
        return true;
      });

      if (raisedNow) result.raised += 1;
      else result.skipped += 1;
    }
  }

  return result;
}
