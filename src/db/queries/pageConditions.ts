// §4.12 — the Conditions tab of Developer Options → Transaction Pages: which
// fields a page has, and setting one kind of rule (visibleWhen / requiredWhen /
// readonlyWhen) on one field.
//
// Only the `conditions` JSONB of master_page_accordion_field_t is touched — the
// same column migrations have always written by hand (e.g. "Cancellation Reason
// visible when Clearing Status is CANCELLED"). The form runtime already applies
// it on screen AND in the save route (a hidden field is not written, a required
// one is enforced), so nothing else changes for a rule to take effect.
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit/recordAudit';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { FieldConditions, Predicate } from '@/lib/pages/conditions';
import { fieldsOf } from '@/lib/pages/conditionRules';
import { getPageTarget } from '@/lib/pages/targets';

type Rows<T> = { rows: T[] };

export interface ConditionField {
  id: number;
  name: string;
  label: string;
  field_type: string;
  accordion_id: number;
  accordion_title: string;
  options_source: string | null;
  options_label_field: string | null;
  options_static: { value: string; label: string }[] | null;
  conditions: FieldConditions | null;
}

/** Every live field of a page, in the order the form shows them. */
export async function pageConditionFields(pageId: number): Promise<ConditionField[]> {
  const rows = await db.execute(sql`
    SELECT f.id, f.name, f.label, f.field_type, a.id AS accordion_id, a.title AS accordion_title,
           f.options_source, f.options_label_field, f.options_static, f.conditions
    FROM master_page_accordion_field_t f
    JOIN master_page_accordion_t a ON a.id = f.accordion_id
    WHERE a.page_id = ${pageId} AND a.display = 'Y' AND f.display = 'Y'
    ORDER BY a.display_order, f.display_order, f.id`);
  return (rows as unknown as Rows<ConditionField>).rows;
}

/**
 * Set one rule kind on one field, keeping every other key of its conditions
 * (min / max bounds, the other rule kinds). `null` removes that rule.
 */
export async function setFieldCondition(
  fieldId: number,
  key: 'visibleWhen' | 'requiredWhen' | 'readonlyWhen',
  predicate: Predicate | null,
  actorId: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const found = await tx.execute(sql`
      SELECT f.id, f.name, f.label, f.conditions, a.page_id
      FROM master_page_accordion_field_t f
      JOIN master_page_accordion_t a ON a.id = f.accordion_id
      WHERE f.id = ${fieldId}
      FOR UPDATE OF f`);
    const field = (found as unknown as Rows<{
      id: number; name: string; label: string; conditions: FieldConditions | null; page_id: number;
    }>).rows[0];
    if (!field) throw new NotFoundError('This field no longer exists — reload the page.');

    if (predicate) {
      const used = [...new Set(fieldsOf(predicate))];
      if (used.includes(field.name)) {
        throw new ValidationError(`${field.label} cannot depend on itself — choose a different controlling field.`, {
          field: 'field',
        });
      }
      // The controlling field must be on the same page, or the rule can never fire.
      const known = await tx.execute(sql`
        SELECT DISTINCT f.name FROM master_page_accordion_field_t f
        JOIN master_page_accordion_t a ON a.id = f.accordion_id
        WHERE a.page_id = ${field.page_id} AND f.display = 'Y'
          AND f.name IN (${sql.join(used.map((u) => sql`${u}`), sql`, `)})`);
      const present = new Set((known as unknown as Rows<{ name: string }>).rows.map((r) => r.name));
      const missing = used.filter((u) => !present.has(u));
      if (missing.length > 0) {
        throw new ValidationError(`The controlling field ${missing.join(', ')} is not on this page.`, { field: 'field' });
      }
    }

    const before = field.conditions ?? {};
    const next: FieldConditions = { ...before };
    if (predicate) next[key] = predicate;
    else delete next[key];
    const stored = Object.keys(next).length > 0 ? next : null;

    await tx.execute(sql`
      UPDATE master_page_accordion_field_t
      SET conditions = ${stored ? JSON.stringify(stored) : null}::jsonb,
          updated_by = ${actorId}, updated_at = now()
      WHERE id = ${fieldId}`);
    await recordAudit(tx, {
      actorId,
      action: 'update',
      entityType: 'master_page_field',
      entityId: fieldId,
      before: { conditions: before },
      after: { conditions: stored },
      metadata: { rule: key },
    });
  });
}

/**
 * The values a NON-dropdown field actually holds — what the Conditions tab
 * offers as its Value choices for a text, number or date field, so a rule is
 * built from a value that exists rather than a spelling typed from memory.
 *
 * The column comes from the page's own field list and is checked against the
 * page target's column whitelist (§4.12) before it reaches SQL as an identifier.
 * Live rows only where the table has a `display` flag. Capped at 200.
 */
export async function fieldRecordedValues(pageId: number, fieldName: string): Promise<string[]> {
  const found = await db.execute(sql`
    SELECT p.slug FROM master_page_t p
    JOIN master_page_accordion_t a ON a.page_id = p.id
    JOIN master_page_accordion_field_t f ON f.accordion_id = a.id
    WHERE p.id = ${pageId} AND f.name = ${fieldName} AND f.display = 'Y'
    LIMIT 1`);
  const slug = (found as unknown as Rows<{ slug: string }>).rows[0]?.slug;
  if (!slug) throw new NotFoundError('That field is not on this page.');

  const target = getPageTarget(slug);
  if (!target || !target.allowedColumns.has(fieldName)) return [];

  const col = sql.identifier(fieldName);
  const live = target.allowedColumns.has('display') ? sql`AND display = 'Y'` : sql``;
  // Ordered by the column itself, so numbers and dates come out in numeric and
  // calendar order rather than as text (where 1000 sorts before 200).
  const rows = await db.execute(sql`
    SELECT DISTINCT ${col} AS raw, ${col}::text AS v FROM ${target.table}
    WHERE ${col} IS NOT NULL AND ${col}::text <> '' ${live}
    ORDER BY raw
    LIMIT 200`);
  return (rows as unknown as Rows<{ v: string }>).rows.map((r) => r.v);
}
