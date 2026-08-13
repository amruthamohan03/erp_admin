// §4.1 — the operating company's own name is configuration, not data.
//
// `done_by_master_t` answers "who did this": the client, or us. The second row
// was seeded as the literal "Malabar", which then surfaced in every Liquidation
// Paid By / License Cleared By / License Submitted To Bank dropdown and made a
// deployment's own identity a database string that no setting could change.
//
// The row that represents the operating company carries `is_company`, and its
// label resolves to the configured project name (Settings → Application) at read
// time. Rename the project and every picker follows in one step.
//
// This is the ONE place that decides that. Do not re-derive it at a call site.

export interface DoneByNameSource {
  done_by_name: string;
  is_company?: boolean | null;
}

/**
 * The label to show for a "done by" row.
 *
 * @param row          Row carrying at least `done_by_name` and `is_company`.
 * @param projectName  Configured project name (branding.project_name).
 */
export function resolveDoneByName(row: DoneByNameSource, projectName: string): string {
  if (!row.is_company) return row.done_by_name;
  // Fall back to the stored text if branding is somehow blank, so the option
  // never renders as an empty string.
  return projectName.trim() || row.done_by_name;
}

/** Map a list of rows onto their resolved labels, preserving every other field. */
export function resolveDoneByNames<T extends DoneByNameSource>(rows: T[], projectName: string): T[] {
  return rows.map((row) => ({ ...row, done_by_name: resolveDoneByName(row, projectName) }));
}

export default resolveDoneByName;
