// §4.9 bulk-update — translate a stored predicate (master_bulk_filter_t.predicate)
// into a SAFE SQL condition. Column names are validated against the page's target
// whitelist (so config can't reference an arbitrary identifier) and values are
// parameterized. Identifiers are qualified to the `i` alias the bulk query uses.
import { sql, type SQL } from 'drizzle-orm';
import { getPageTarget } from './targets';

export interface BulkLeaf {
  col: string;
  op: 'isNull' | 'isNotNull' | 'empty' | 'notEmpty' | 'eq' | 'neq';
  value?: unknown;
}
export type BulkPredicate = BulkLeaf | { all: BulkPredicate[] } | { any: BulkPredicate[] };

function leafSql(leaf: BulkLeaf, allowed: Set<string>): SQL {
  if (!allowed.has(leaf.col)) {
    throw new Error(`bulk filter references a column not on the page target: ${leaf.col}`);
  }
  const col = sql`${sql.identifier('i')}.${sql.identifier(leaf.col)}`;
  switch (leaf.op) {
    case 'isNull': return sql`${col} IS NULL`;
    case 'isNotNull': return sql`${col} IS NOT NULL`;
    case 'empty': return sql`(${col} IS NULL OR ${col} = '')`;
    case 'notEmpty': return sql`(${col} IS NOT NULL AND ${col} <> '')`;
    case 'eq': return sql`${col} = ${leaf.value ?? null}`;
    case 'neq': return sql`${col} <> ${leaf.value ?? null}`;
    default: throw new Error(`bulk filter has an unknown op: ${(leaf as BulkLeaf).op}`);
  }
}

export function buildBulkWhere(pageSlug: string, pred: BulkPredicate): SQL {
  const target = getPageTarget(pageSlug);
  if (!target) throw new Error(`unknown page target: ${pageSlug}`);
  const allowed = target.allowedColumns;

  function build(p: BulkPredicate): SQL {
    if ('all' in p) return sql`(${sql.join(p.all.map(build), sql` AND `)})`;
    if ('any' in p) return sql`(${sql.join(p.any.map(build), sql` OR `)})`;
    return leafSql(p as BulkLeaf, allowed);
  }
  return build(pred);
}

/** Validate + intersect an editable-field list with the page target whitelist. */
export function safeEditableColumns(pageSlug: string, fields: unknown): string[] {
  const target = getPageTarget(pageSlug);
  if (!target || !Array.isArray(fields)) return [];
  return fields.filter((f): f is string => typeof f === 'string' && target.allowedColumns.has(f));
}
