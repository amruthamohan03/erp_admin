import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import type { AuthPayload } from './index';

// §4.7 — row-level scoping: a client login sees its own client's rows and
// nothing else.
//
// This is a SECURITY boundary, so three rules hold everywhere:
//
//   1. It is enforced in the QUERY, never in the UI. Hiding a row in React
//      leaves it on the wire, in the Excel export, and one bookmarked URL away.
//   2. It is resolved from the DATABASE, not from the token. A JWT lasts seven
//      days, so an account that was scoped after its holder logged in would
//      carry an unscoped token until it expired — the window in which the
//      feature silently does not apply.
//   3. It FAILS CLOSED. Anything that cannot be resolved to a real staff
//      account is treated as scoped-to-nothing rather than scoped-to-everything.
//
// Which MENUS a client login can reach remains the role's job
// (`role_menu_mapping_t`, §4.7). This decides only which rows it sees inside
// the screens it can already reach — the two are separate and both are needed.

/** What a session is allowed to see. */
export type ClientScope =
  /** A member of staff: every row, as before this feature existed. */
  | { kind: 'all' }
  /** A client login: only rows carrying this client id. */
  | { kind: 'client'; clientId: number }
  /** Resolvable to neither — see `NOTHING` below. */
  | { kind: 'none' };

export const ALL: ClientScope = { kind: 'all' };

/**
 * Used when the account behind a valid token cannot be found — deleted, or a
 * token signed for a database this one is not.
 *
 * Returning `all` there would turn a missing row into full access, which is the
 * exact shape of a privilege-escalation bug. Returning `none` shows an empty
 * list to somebody who should not have got this far, which is recoverable.
 */
export const NOTHING: ClientScope = { kind: 'none' };

/**
 * The scope for a session, read from `users_t.client_id`.
 *
 * Prepared and keyed on the user id — this runs on every scoped request, which
 * §7.3 names as a hot path.
 */
const scopeQuery = db
  .select({ clientId: sql<number | null>`client_id` })
  .from(sql`users_t`)
  .where(sql`id = ${sql.placeholder('uid')} AND display = 'Y'`)
  .prepare('user_client_scope');

export async function resolveClientScope(session: AuthPayload): Promise<ClientScope> {
  const rows = await scopeQuery.execute({ uid: session.uid });
  const row = rows[0];
  if (!row) return NOTHING;
  return row.clientId == null ? ALL : { kind: 'client', clientId: Number(row.clientId) };
}

/**
 * The predicate to AND into a query, for a table's own client column.
 *
 * Pure, so the rule itself is unit-tested without a database — the part worth
 * pinning is that `all` widens to nothing and `none` narrows to nothing, and
 * that neither is ever accidentally the other.
 */
export function clientScopeCondition(scope: ClientScope, column: AnyPgColumn | SQL): SQL {
  switch (scope.kind) {
    case 'all':
      // TRUE rather than omitting the clause, so a caller cannot forget to
      // handle the staff case and leave `and(undefined)` behind.
      return sql`true`;
    case 'client':
      return sql`${column} = ${scope.clientId}`;
    case 'none':
      return sql`false`;
  }
}

/**
 * One call for a route that just needs the predicate.
 *
 * Prefer this at a call site: it is one line, and it cannot be got wrong by
 * resolving the scope and then forgetting to apply it.
 */
export async function clientScopeFor(
  session: AuthPayload,
  column: AnyPgColumn | SQL,
): Promise<SQL> {
  return clientScopeCondition(await resolveClientScope(session), column);
}

/**
 * Whether a scope may see a specific client's data — for a DETAIL route, which
 * filters nothing and so cannot rely on a WHERE clause alone.
 *
 * A record with no client at all is staff-only: it carries no owner, so no
 * client login can claim it.
 */
export function scopeAllowsClient(scope: ClientScope, clientId: number | null | undefined): boolean {
  if (scope.kind === 'all') return true;
  if (scope.kind === 'none') return false;
  return clientId != null && Number(clientId) === scope.clientId;
}
