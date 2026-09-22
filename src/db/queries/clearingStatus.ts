import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

// The one way to match a clearing status, for every table that carries one.
//
// Resolved from the master TEXT rather than an id (§4.1): the seed leaves ids
// 1–3 unused and `clearing_status` is deliberately nullable with no default, so
// a reseed that renumbers the master must not silently change what a filter
// counts. Both tracking tables and the dashboards share this single definition
// so a status can never mean one thing on the list and another on the tiles.

/** Canonical status texts, as stored in `clearing_status_master_t`. */
export const CLEARING_STATUS = {
  inTransit: 'IN TRANSIT',
  inProgress: 'IN PROGRESS',
  completed: 'CLEARING COMPLETED',
  cancelled: 'CANCELLED',
  clearedWithIr: 'CLEARED WITH IR',
  clearedWithAra: 'CLEARED WITH ARA',
} as const;

/** True for a row whose clearing status is exactly `text`. */
export function clearingStatusIs(column: AnyPgColumn, text: string): SQL {
  return sql`${column} IN (
    SELECT id FROM clearing_status_master_t WHERE upper(clearing_status) = ${text})`;
}

/**
 * True for a row whose clearing status is any of `texts`.
 *
 * "Finished" is more than one status — a file cleared with an IR or an ARA is
 * finished too — so anything asking "is this done" needs the set, not a single
 * comparison.
 */
export function clearingStatusIn(column: AnyPgColumn, texts: readonly string[]): SQL {
  return sql`${column} IN (
    SELECT id FROM clearing_status_master_t
     WHERE upper(clearing_status) IN (${sql.join(texts.map((t) => sql`${t}`), sql`, `)}))`;
}
