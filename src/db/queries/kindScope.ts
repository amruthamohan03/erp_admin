import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

// §4.1 — which side of the business a record serves, decided by the KIND's own
// flags and nothing else.
//
// `kind_master_t.use_for_import` / `use_for_export` are operator-editable on
// /masters/kinds, so re-classifying a kind is a master edit rather than a
// deploy. Migration 0062 replaced a `kind_name ILIKE 'EXPORT%'` filter with
// these columns precisely so that renaming a kind could not silently
// reclassify it.
//
// IMPORT TEMPORARY carries BOTH flags by design: a temporary import leaves
// again as a re-export. That is also why the tracking lists have to ask the
// flags rather than assume a table's rows are all one direction — an
// import-kind file legitimately belongs on the export side, and an
// import-ONLY kind does not.
//
// Shared by the licence filters and both tracking lists so the answer to
// "is this an export?" is given in one place (§4.10).

export type KindUseFor = 'import' | 'export';

/**
 * True for a row whose kind is flagged for `useFor`.
 *
 * A row with NO kind matches NEITHER direction on its own — it cannot be
 * classified. Callers that list records pair this with `orKindMissing` so an
 * unclassified row stays visible: hiding it would hide the data gap, and the
 * row would then appear on no screen at all.
 */
export function kindUseForCondition(kindColumn: AnyPgColumn | SQL, useFor: KindUseFor): SQL {
  const flag = useFor === 'import' ? 'use_for_import' : 'use_for_export';
  return sql`${kindColumn} IN (
    SELECT id FROM kind_master_t WHERE ${sql.identifier(flag)} IS TRUE)`;
}

/**
 * The same, but keeping rows that carry no kind at all.
 *
 * This is what a LIST wants. A consignment saved before the kind pickers were
 * filtered — or with the field left empty — still has to be findable and
 * fixable by somebody; dropping it from both tracking screens would strand it
 * where no operator could reach it.
 */
export function kindUseForOrMissing(kindColumn: AnyPgColumn | SQL, useFor: KindUseFor): SQL {
  return sql`(${kindUseForCondition(kindColumn, useFor)} OR ${kindColumn} IS NULL)`;
}
