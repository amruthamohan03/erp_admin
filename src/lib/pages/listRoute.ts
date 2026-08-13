// §4.13 — where a transaction page's Back button and its post-save redirect go.
//
// The invariant this relies on: a transaction page always sits exactly one
// segment below its list view.
//
//   /masters/clients/new   /masters/clients/42   ->  /masters/clients
//   /imports/new           /imports/42           ->  /imports
//   /payments/new          /payments/42          ->  /payments
//
// So the list is the parent path, derived from the URL the user is already on.
//
// This deliberately does NOT read master_page_t.route. That column is operator-
// editable with nothing tying it to the filesystem, and it had drifted on four of
// the eight pages (clients said '/clients'; the page is at '/masters/clients'),
// which sent every save to a 404 — after the record had been written, so the data
// was fine but the operator was told the opposite. A derived path cannot drift.
// `route` remains the fallback for the case where there is no parent segment.

/**
 * The list route for a transaction page at `pathname`.
 *
 * @param pathname  Current URL path (from usePathname()).
 * @param fallback  Used when `pathname` has no parent segment — e.g. the
 *                  configured page route, else the dashboard.
 */
export function parentListRoute(pathname: string | null | undefined, fallback?: string | null): string {
  const parent = (pathname ?? '')
    .replace(/[?#].*$/, '') // defensive: usePathname() excludes these already
    .replace(/\/+$/, '') // trailing slash
    .replace(/\/[^/]+$/, ''); // the /new or /:id segment
  return parent || fallback || '/dashboard';
}

export default parentListRoute;
