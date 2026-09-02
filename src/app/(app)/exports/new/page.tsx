import { redirect } from 'next/navigation';

// Export tracking has one create path, and it is the grid at /exports/bulk-new.
//
// This route used to render the single-record form, presented beside the grid as
// a choice the operator had to make before they had entered anything. The grid
// handles one row as readily as twenty, so the choice bought nothing and cost
// whoever guessed wrong a trip back to the list. The single-record form is still
// how an export is EDITED — that is /exports/[id].
//
// Kept as a redirect rather than deleted so a bookmark or a pasted link lands on
// the create screen instead of a 404.
export default function NewExportPage(): never {
  redirect('/exports/bulk-new');
}
