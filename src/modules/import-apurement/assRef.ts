/**
 * The ASS REF a file shows and exports: the saved one, else the file's own
 * Insurance Reference (what the legacy grid offered as an unsaved "auto" value).
 *
 * Pure, so the grid, the dashboard and the server-side spreadsheets all agree.
 */
export function effectiveAssRef(r: { saved_ass_ref: string | null; auto_ass_ref: string | null }): string | null {
  return (r.saved_ass_ref?.trim() || r.auto_ass_ref) ?? null;
}
