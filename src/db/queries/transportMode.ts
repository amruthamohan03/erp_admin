import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

// The one way to match a transport mode, for every table that carries one.
//
// Resolved from `transport_letter` rather than an id, for the same reason
// `clearingStatus.ts` resolves from the status text (§4.1): main's dashboard
// wrote `transport_mode = 1` for road and `= 2` for air in nine places, so a
// reseed that renumbered the master would have silently moved the entire road
// logistics tab onto air files — with every figure still looking plausible.
//
// The letter is the stable identifier here: it is what the reference-number
// formats embed (§4.33), so it cannot be changed without renaming consignments.

/** Transport letters as stored in `transport_mode_master_t.transport_letter`. */
export const TRANSPORT = {
  road: 'R',
  air: 'A',
  wagon: 'W',
  lake: 'L',
} as const;

export type TransportLetter = (typeof TRANSPORT)[keyof typeof TRANSPORT];

/** True for a row whose transport mode carries exactly `letter`. */
export function transportModeIs(column: AnyPgColumn, letter: TransportLetter): SQL {
  return sql`${column} IN (
    SELECT id FROM transport_mode_master_t WHERE upper(transport_letter) = ${letter})`;
}
