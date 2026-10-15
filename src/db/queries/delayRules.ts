import { getTableColumns } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db, type Transaction } from '@/lib/db';
import { exportT, importT } from '@/db/schema';
import { ValidationError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import type {
  DelayRuleCreateInput,
  DelayRuleUpdateInput,
} from '@/schemas/delay-tracker';

// Reading and writing delay rules.
//
// The one thing worth care here is that a rule NAMES COLUMNS. Those names
// reach `sql.identifier` when the tracker reads a file, so a rule pointing at
// a column that does not exist is a broken query on a screen, not a bad row.
// Every field is therefore checked against the real table before it is stored,
// and rejected with the column named (§4.23) rather than at read time.

function rowsOf<R>(result: unknown): R[] {
  return (result as { rows?: R[] }).rows ?? [];
}

const TABLES = { import: importT, export: exportT } as const;
export type DelayModule = keyof typeof TABLES;

/**
 * The date columns a module's rules may name.
 *
 * Taken from the Drizzle table rather than a hand-kept list, so a column added
 * to the form is selectable here the same day and one removed stops being
 * offered — the drift a second list would guarantee (§4.10).
 */
/**
 * Drizzle's column types for something carrying a calendar day.
 *
 * `date(…)` reports `PgDateString`, not `PgDate` — filtering on the latter
 * matched nothing but the two timestamps, which left the rule editor offering
 * `created_at` and `updated_at` and none of the 27 milestones a rule is
 * actually about.
 */
const DAY_COLUMN_TYPES = new Set(['PgDateString', 'PgDate', 'PgTimestamp', 'PgTimestampString']);

export function dateFieldsFor(module: DelayModule): string[] {
  return Object.values(getTableColumns(TABLES[module]))
    .filter((c) => DAY_COLUMN_TYPES.has(c.columnType))
    .map((c) => c.name)
    .sort();
}

/** Throw a named 422 if any field the input names is not a real date column. */
function assertFields(module: DelayModule, input: DelayRuleCreateInput | DelayRuleUpdateInput): void {
  const allowed = new Set(dateFieldsFor(module));
  const check = (value: string | undefined, label: string): void => {
    if (value === undefined) return;
    if (!allowed.has(value)) {
      throw new ValidationError(
        `${label} must be a date field on the ${module} form — "${value}" is not one.`,
      );
    }
  };
  check(input.start_field, 'Start date');
  check(input.end_field, 'End date');
  (input.stages ?? []).forEach((s, i) => {
    const where = `Sub-period ${i + 1} (${s.short_label || s.stage_key})`;
    check(s.from_field, `${where} start`);
    check(s.to_field, `${where} end`);
  });
}

export interface DelayRuleDetail {
  id: number;
  module: DelayModule;
  rule_key: string;
  name: string;
  transport_letter: string | null;
  start_field: string;
  end_field: string;
  target_days: number;
  day_basis: string;
  notify_days_before: number[];
  notify_overdue: boolean;
  display: 'Y' | 'N';
  stages: Array<{
    id: number;
    stage_key: string;
    label: string;
    short_label: string;
    from_field: string;
    to_field: string;
    target_days: number;
    priority: boolean;
    color: string;
    icon: string;
    sort_order: number;
  }>;
}

export async function listDelayRules(includeHidden = false): Promise<DelayRuleDetail[]> {
  const rules = rowsOf<Omit<DelayRuleDetail, 'stages'>>(
    await db.execute(sql`
      SELECT id, module, rule_key, name, transport_letter, start_field, end_field,
             target_days, day_basis, notify_days_before, notify_overdue, display
        FROM delay_rule_master_t
       ${includeHidden ? sql`` : sql`WHERE display = 'Y'`}
       ORDER BY module, transport_letter NULLS FIRST, id`),
  );
  if (rules.length === 0) return [];

  const stages = rowsOf<DelayRuleDetail['stages'][number] & { rule_id: number }>(
    await db.execute(sql`
      SELECT id, rule_id, stage_key, label, short_label, from_field, to_field,
             target_days, priority, color, icon, sort_order
        FROM delay_rule_stage_t
       WHERE display = 'Y'
         AND rule_id IN (${sql.join(rules.map((r) => sql`${r.id}`), sql`, `)})
       ORDER BY rule_id, sort_order, id`),
  );

  return rules.map((r) => ({
    ...r,
    notify_days_before: Array.isArray(r.notify_days_before) ? r.notify_days_before : [],
    stages: stages.filter((s) => s.rule_id === r.id),
  }));
}

/** Replace a rule's stages wholesale — the shape the editor submits. */
async function writeStages(
  tx: Transaction,
  ruleId: number,
  stages: DelayRuleCreateInput['stages'],
): Promise<void> {
  await tx.execute(sql`DELETE FROM delay_rule_stage_t WHERE rule_id = ${ruleId}`);
  if (!stages || stages.length === 0) return;
  for (const [i, s] of stages.entries()) {
    await tx.execute(sql`
      INSERT INTO delay_rule_stage_t
        (rule_id, stage_key, label, short_label, from_field, to_field, target_days,
         priority, color, icon, sort_order)
      VALUES (${ruleId}, ${s.stage_key}, ${s.label}, ${s.short_label}, ${s.from_field},
              ${s.to_field}, ${s.target_days}, ${s.priority}, ${s.color}, ${s.icon},
              ${s.sort_order || i + 1})`);
  }
}

export async function createDelayRule(
  input: DelayRuleCreateInput,
  actorUserId: number,
): Promise<DelayRuleDetail> {
  assertFields(input.module, input);

  return db.transaction(async (tx) => {
    const [row] = rowsOf<{ id: number }>(
      await tx.execute(sql`
        INSERT INTO delay_rule_master_t
          (module, rule_key, name, transport_letter, start_field, end_field, target_days,
           day_basis, notify_days_before, notify_overdue, display, created_by, updated_by)
        VALUES (${input.module}, ${input.rule_key}, ${input.name}, ${input.transport_letter},
                ${input.start_field}, ${input.end_field}, ${input.target_days},
                ${input.day_basis}, ${JSON.stringify(input.notify_days_before)}::jsonb,
                ${input.notify_overdue}, ${input.display ?? 'Y'}, ${actorUserId}, ${actorUserId})
        RETURNING id`),
    );
    await writeStages(tx, row.id, input.stages);
    await recordAudit(tx, {
      actorId: actorUserId,
      action: 'create',
      entityType: 'delay_rule',
      entityId: row.id,
      module: 'delay-rules',
      after: input as unknown as Record<string, unknown>,
    });
    const [detail] = await listDelayRulesById(row.id);
    return detail;
  });
}

async function listDelayRulesById(id: number): Promise<DelayRuleDetail[]> {
  return (await listDelayRules(true)).filter((r) => r.id === id);
}

export async function updateDelayRule(
  id: number,
  input: DelayRuleUpdateInput,
  actorUserId: number,
): Promise<DelayRuleDetail> {
  const [before] = await listDelayRulesById(id);
  if (!before) throw new ValidationError('That delay rule no longer exists.');
  assertFields((input.module ?? before.module) as DelayModule, input);
  // The Status switch disables through this PUT, so it needs the same guard as
  // Delete — one door left open is the whole bug (§4.37).
  if (input.display === 'N') {
    assertNotDefaultRule({
      ...before,
      transport_letter: input.transport_letter !== undefined ? input.transport_letter : before.transport_letter,
    });
  }

  return db.transaction(async (tx) => {
    const sets = [];
    if (input.name !== undefined) sets.push(sql`name = ${input.name}`);
    if (input.transport_letter !== undefined) sets.push(sql`transport_letter = ${input.transport_letter}`);
    if (input.start_field !== undefined) sets.push(sql`start_field = ${input.start_field}`);
    if (input.end_field !== undefined) sets.push(sql`end_field = ${input.end_field}`);
    if (input.target_days !== undefined) sets.push(sql`target_days = ${input.target_days}`);
    if (input.day_basis !== undefined) sets.push(sql`day_basis = ${input.day_basis}`);
    if (input.notify_days_before !== undefined)
      sets.push(sql`notify_days_before = ${JSON.stringify(input.notify_days_before)}::jsonb`);
    if (input.notify_overdue !== undefined) sets.push(sql`notify_overdue = ${input.notify_overdue}`);
    if (input.display !== undefined) sets.push(sql`display = ${input.display}`);
    sets.push(sql`updated_by = ${actorUserId}`, sql`updated_at = now()`);

    await tx.execute(sql`
      UPDATE delay_rule_master_t SET ${sql.join(sets, sql`, `)} WHERE id = ${id}`);

    if (input.stages !== undefined) await writeStages(tx, id, input.stages);

    await recordAudit(tx, {
      actorId: actorUserId,
      action: 'update',
      entityType: 'delay_rule',
      entityId: id,
      module: 'delay-rules',
      before: before as unknown as Record<string, unknown>,
      after: input as unknown as Record<string, unknown>,
    });

    const [detail] = await listDelayRulesById(id);
    return detail;
  });
}

/**
 * The module's default is what every unmatched file falls back to; hiding it
 * would leave those files unmeasured and silently absent from the tracker.
 * Shared by Delete and the PUT that the Status switch uses.
 */
function assertNotDefaultRule(rule: Pick<DelayRuleDetail, 'name' | 'module' | 'transport_letter'>): void {
  if (rule.transport_letter === null) {
    throw new ValidationError(
      `"${rule.name}" is the default rule for ${rule.module} files — every file with no transport-specific rule is measured by it. Point those files at another default before disabling this one.`,
    );
  }
}

/** Soft delete (§4.27) — a rule is hidden, never destroyed. */
export async function hideDelayRule(id: number, actorUserId: number): Promise<void> {
  const [before] = await listDelayRulesById(id);
  if (!before) throw new ValidationError('That delay rule no longer exists.');
  assertNotDefaultRule(before);
  await db.transaction(async (tx) => {
    await tx.execute(sql`UPDATE delay_rule_master_t SET display = 'N', updated_by = ${actorUserId} WHERE id = ${id}`);
    await recordAudit(tx, {
      actorId: actorUserId,
      action: 'delete',
      entityType: 'delay_rule',
      entityId: id,
      module: 'delay-rules',
      before: before as unknown as Record<string, unknown>,
    });
  });
}
