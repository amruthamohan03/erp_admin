import { sql, type SQL } from 'drizzle-orm';
import { importT } from '@/db/schema';
import { CLEARING_STATUS, clearingStatusIn } from './clearingStatus';
import { TRANSPORT, transportModeIs } from './transportMode';
import {
  getOverstayingImportIds,
  missingDateCondition,
  pipelineCondition,
  reportFilterCondition,
  roadStageCondition,
} from './importDashboardTabs';
import { importDateField, IMPORT_PIPELINE_STEPS } from '@/lib/tracking/importDateFields';
import { ROAD_MILESTONES } from '@/lib/tracking/roadMilestones';
import type { ImportDashboardExportQuery } from '@/schemas/import-dashboard';

// What each of the Import dashboard's six spreadsheets selects.
//
// Main had six export methods totalling some 400 lines, each rebuilding the
// same 40-column SELECT and the same header styling. All six differ only in
// their WHERE clause and their title, so this resolves to exactly that pair and
// the route hands it to `buildPageExportSheet` — the same builder behind the
// imports list's own Export, which takes its columns from the page definition
// rather than a list kept by hand (§4.10). A field added to the Import form
// appears in all six sheets with no change here.
//
// Zod has already checked that each scope carries the arguments it needs
// (`import-dashboard.ts`), which is what lets the non-null assertions stand:
// `field` is proven present for `missing` and `custom`, `stage` for `stage`,
// `step` for `pipeline`.

/**
 * What the Briefing tab means by CLEARED: everything off the operator's desk,
 * which is wider than CLEARING COMPLETED alone. Shared by the briefing export
 * and the cleared-only missing-date cards so the two cannot drift (§4.10).
 */
function clearedStatuses(): SQL {
  return clearingStatusIn(importT.clearingStatus, [
    CLEARING_STATUS.completed,
    CLEARING_STATUS.clearedWithIr,
    CLEARING_STATUS.clearedWithAra,
  ]);
}

export interface ImportExportScope {
  /** Extra WHERE on `imports_t`. The builder adds its own `display = 'Y'`. */
  where: SQL;
  /** Sheet title — also the filename stem's human half. */
  title: string;
  filename: string;
}

export async function importDashboardExportScope(
  q: ImportDashboardExportQuery,
): Promise<ImportExportScope> {
  const filters = reportFilterCondition(q);

  switch (q.scope) {
    case 'briefing': {
      return {
        where: sql`${filters} AND ${clearedStatuses()}`,
        title: 'Briefing - Cleared Files',
        filename: 'import-briefing',
      };
    }

    case 'border-overstay': {
      // Overstay is a working-day calculation over the holiday master, which no
      // WHERE clause expresses — so the ids come from the same classifier the
      // screen renders, and the sheet is guaranteed to hold the rows the
      // operator was looking at.
      const ids = await getOverstayingImportIds();
      return {
        where:
          ids.length > 0
            ? sql`${filters} AND ${importT.id} IN (${sql.join(
                ids.map((id) => sql`${id}`),
                sql`, `,
              )})`
            : // An impossible predicate: nothing overstaying gives an empty
              // sheet rather than the whole table.
              sql`${filters} AND false`,
        title: 'Border Overstay',
        filename: 'import-border-overstay',
      };
    }

    case 'stage': {
      const index = ROAD_MILESTONES.findIndex((m) => m.key === q.stage);
      const milestone = ROAD_MILESTONES[index];
      return {
        where: sql`${filters}
          AND ${transportModeIs(importT.transportMode, TRANSPORT.road)}
          AND ${roadStageCondition(index)}`,
        title: `Waiting - ${milestone.label}`,
        filename: `import-stage-${milestone.key}`,
      };
    }

    case 'missing': {
      const field = importDateField(q.field!)!;
      const base = sql`${filters} AND ${missingDateCondition(field.key, field.transportLetter)}`;
      // The Briefing tab counts within the cleared scope, so its cards must
      // download within it too — otherwise the sheet holds more rows than the
      // number that was clicked.
      return {
        where: q.cleared_only ? sql`${base} AND ${clearedStatuses()}` : base,
        title: q.cleared_only ? `Cleared, missing ${field.label}` : `Missing - ${field.label}`,
        filename: `import-missing-${field.key}`,
      };
    }

    case 'pipeline': {
      const step = IMPORT_PIPELINE_STEPS.find((s) => s.key === q.step)!;
      // Non-null: Zod validated the step against this same list.
      return {
        where: sql`${filters} AND ${pipelineCondition(step.key)!}`,
        title: step.label,
        filename: `import-${step.key}`,
      };
    }

    case 'custom': {
      // The opposite of a missing-date card: files where the chosen date IS
      // filled and falls in the range. The range therefore applies to THAT
      // field, not to the creation date the other scopes filter on — which is
      // why this scope passes only the client through to the shared filter.
      const field = importDateField(q.field!)!;
      return {
        where: sql`${reportFilterCondition({ client_id: q.client_id })}
          AND ${sql.identifier(field.key)} IS NOT NULL
          AND ${sql.identifier(field.key)} BETWEEN ${q.from!} AND ${q.to!}`,
        title: `${field.label} - ${q.from} to ${q.to}`,
        filename: `import-${field.key}`,
      };
    }
  }
}
