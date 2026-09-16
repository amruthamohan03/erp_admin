import type { MenuTreeNode } from '@/types/menu';

// The browser tab's title, resolved from the route.
//
// Every page used to render the same "ERP Admin", so half a dozen open tabs were
// indistinguishable and browser history was a wall of one repeated word.
//
// The name comes from `menu_master_t`, not from a table in this file (§4.1): the
// sidebar already names every screen, an operator can rename one without a
// deploy, and a title that disagreed with the menu it was reached from would be
// its own small bug. A route with no menu row falls back to its own path, so a
// page still gets a real title the day it is added and before anyone configures
// a menu for it.

/** `menu/index` and `/menu` are the same route; the sidebar normalises the same way. */
export function normalisePath(url: string | null | undefined): string {
  if (!url || url === '#') return '';
  const cleaned = url.replace(/\/index$/i, '').replace(/^\/+/, '').replace(/\/+$/, '');
  return cleaned ? `/${cleaned}` : '/';
}

/**
 * `goods-types` → `Goods Types`, `roletoexpensetype` → `Roletoexpensetype`.
 *
 * Only ever a fallback. It cannot know that `sub-offices` is called "Declaration
 * Office" — that is precisely what the menu row is for — but it beats showing
 * the operator a bare URL.
 */
export function humanizeSegment(segment: string): string {
  return segment
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** A numeric id or `new` — the segment of a detail route, not a page name. */
function isRecordSegment(segment: string): boolean {
  return segment === 'new' || /^\d+$/.test(segment);
}

/**
 * The page name for `pathname`, from the menu tree.
 *
 * Longest match wins, so `/licenses/dashboard` prefers "License Dashboard" over
 * the "/licenses" list it sits under. A detail route (`/licenses/42`) has no
 * menu of its own and resolves to its parent's name, which is what the operator
 * navigated from.
 */
export function resolveMenuTitle(
  pathname: string,
  menus: readonly MenuTreeNode[],
): string | null {
  const path = normalisePath(pathname);
  if (!path || path === '/') return null;

  let best: { href: string; name: string } | null = null;
  const visit = (nodes: readonly MenuTreeNode[]): void => {
    for (const n of nodes) {
      const href = normalisePath(n.url);
      // A group row (`#`) names no route, and `/` would prefix-match everything.
      if (href && href !== '/') {
        const exact = path === href;
        const under = path.startsWith(`${href}/`);
        if ((exact || under) && (!best || href.length > best.href.length)) {
          best = { href, name: n.menu_name };
        }
      }
      if (n.children?.length) visit(n.children);
    }
  };
  visit(menus);

  return best ? (best as { name: string }).name : null;
}

/**
 * The page name from the path alone, for a route no menu covers.
 *
 * Record segments are dropped rather than rendered: "Licenses 42" reads as a
 * quantity, and "Licenses New" as a page that does not exist. The record's own
 * identity is not known here — the tab says which SCREEN you are on, which is
 * the question a row of tabs has to answer.
 */
export function fallbackTitle(pathname: string): string | null {
  const parts = normalisePath(pathname).split('/').filter(Boolean);
  while (parts.length > 0 && isRecordSegment(parts[parts.length - 1])) parts.pop();
  const last = parts[parts.length - 1];
  return last ? humanizeSegment(last) : null;
}

/**
 * The full `document.title`.
 *
 * `Page | App` rather than `App | Page`: a tab strip truncates from the right, so
 * the half that distinguishes one tab from another has to come first — which is
 * the whole point of the change.
 */
export function buildDocumentTitle(
  pathname: string,
  menus: readonly MenuTreeNode[],
  appTitle: string,
): string {
  const page = resolveMenuTitle(pathname, menus) ?? fallbackTitle(pathname);
  if (!page || page === appTitle) return appTitle;
  return `${page} | ${appTitle}`;
}
