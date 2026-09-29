import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoiceGridHeadingMaster } from '@/db/schema';
import {
  GRID_KEYS,
  defaultAllHeadings,
  isColumnOf,
  isGridKey,
  mergeHeadings,
  type AllGridHeadings,
  type GridHeadings,
  type GridKey,
} from '@/lib/invoiceGrid/columns';

// One place that reads the configured invoice-grid headings (§4.10).
//
// The editable grid and the printed facture both resolve through here, so a
// column renamed in the master is renamed on screen AND on the document the
// client receives. Two lookups would be two chances to disagree, and the
// disagreement would surface on a facture already sent.

/**
 * Every grid's headings, with the built-in labels underneath.
 *
 * Read in one query rather than three: the grid holds all three sets at once
 * (a single import invoice draws both the CDF and the USD columns), and the
 * table is two dozen rows.
 *
 * A category override wins over the general row for that column — the general
 * row is read first and the scoped one applied on top, which works because the
 * query orders NULL scopes first.
 */
export async function loadGridHeadings(categoryId?: number | null): Promise<AllGridHeadings> {
  const rows = await db
    .select({
      gridKey: invoiceGridHeadingMaster.gridKey,
      columnKey: invoiceGridHeadingMaster.columnKey,
      categoryId: invoiceGridHeadingMaster.categoryId,
      heading: invoiceGridHeadingMaster.heading,
    })
    .from(invoiceGridHeadingMaster)
    .where(eq(invoiceGridHeadingMaster.display, 'Y'))
    .orderBy(asc(invoiceGridHeadingMaster.id));

  const configured: Record<string, GridHeadings> = {};

  // TWO passes rather than one ordered query: the general rows are applied
  // first and the category-scoped ones on top, so the override always wins.
  //
  // Doing it by ORDER BY was wrong and silently so — Postgres sorts NULLs LAST
  // in an ASC ordering, so the scoped rows came first and the general row then
  // overwrote them. The override looked like it did nothing. Ordering is not
  // worth depending on for a precedence rule that can be stated directly.
  for (const scoped of [false, true]) {
    for (const r of rows) {
      const isScoped = r.categoryId != null;
      if (isScoped !== scoped) continue;
      // A row scoped to a DIFFERENT category says nothing about this one.
      if (isScoped && r.categoryId !== categoryId) continue;
      // A row whose grid or column the code no longer draws is ignored rather
      // than becoming a heading over nothing (the mirror of §4.25.1's rule that
      // a removed column must not leave a hole in a saved layout).
      if (!isGridKey(r.gridKey) || !isColumnOf(r.gridKey, r.columnKey)) continue;
      (configured[r.gridKey] ??= {})[r.columnKey] = r.heading;
    }
  }

  // Merged over the built-ins, so an unseeded database and a half-configured
  // one both render a grid whose columns have names (§4.33's fallback rule).
  return Object.fromEntries(
    GRID_KEYS.map((g) => [g, mergeHeadings(g, configured[g])]),
  ) as AllGridHeadings;
}

/** The built-ins, for a caller that cannot reach the database. */
export { defaultAllHeadings };

export type { AllGridHeadings, GridHeadings, GridKey };
