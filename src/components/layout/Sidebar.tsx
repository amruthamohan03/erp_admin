'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, LayoutGrid, X } from 'lucide-react';
import clsx from 'clsx';
import { useSidebar } from '@/components/layout/SidebarProvider';
import { useBranding } from '@/lib/hooks/useBranding';
import type { MenuTreeNode } from '@/types/menu';

// Convert "menu/index"-style URLs into "/menu" Next.js routes.
// Adjust this if your routing scheme differs.
function toHref(url: string | null | undefined): string {
  if (!url || url === '#') return '#';
  // strip trailing /index, leading slash, etc.
  const cleaned = url.replace(/\/index$/i, '').replace(/^\/+/, '');
  return '/' + cleaned;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '#' || href === '/') return false;
  return pathname === href || pathname.startsWith(href + '/');
}

export default function Sidebar() {
  const pathname = usePathname();
  const branding = useBranding();
  const { mobileOpen, closeMobile, collapsed, setCollapsed, rail } = useSidebar();
  const [menus, setMenus] = useState<MenuTreeNode[]>([]);
  // Accordion, not a set: exactly one main menu is expanded at a time. With a long
  // menu tree, several open groups push the active submenu off-screen and the user
  // loses the sense of where they are.
  const [openGroup, setOpenGroup] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/menus')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setMenus(j.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Auto-open the group containing the active route on first load / route change.
  const activeParentId = useMemo(() => {
    for (const top of menus) {
      for (const child of top.children) {
        if (isActive(pathname, toHref(child.url))) return top.id;
      }
    }
    return null;
  }, [menus, pathname]);

  // Navigating collapses whatever else was open and expands only the group holding
  // the active route. When no group owns the route (a top-level leaf such as the
  // dashboard) we leave the current one alone rather than closing a group the user
  // just opened to browse. setState is guarded so it's a no-op once that group is
  // already the open one — no cascading render loop.
  useEffect(() => {
    if (activeParentId != null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpenGroup((prev) => (prev === activeParentId ? prev : activeParentId));
    }
  }, [activeParentId]);

  function toggle(id: number) {
    // In rail mode the children have nowhere to render, so the click means "show me
    // this group" — widen the sidebar and open it, rather than toggling state the
    // user cannot see. Everywhere else it is a plain open/close.
    if (rail) {
      setCollapsed(false);
      setOpenGroup(id);
      return;
    }

    setOpenGroup((prev) => (prev === id ? null : id));
  }

  return (
    <>
      {/* Drawer backdrop — below `lg` only. Kept mounted so it can fade. */}
      <div
        aria-hidden
        onClick={closeMobile}
        className={clsx(
          'fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-200 lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        aria-label="Main navigation"
        className={clsx(
          // `fixed` at every breakpoint — as an overlay drawer below `lg`, and as a
          // pinned column from `lg` up. Fixed rather than sticky on purpose: the
          // sidebar must not move when a long page scrolls, and sticky is only as
          // reliable as the overflow/height of every ancestor between here and the
          // viewport. DashboardShell offsets the content column to match the width.
          'fixed inset-y-0 start-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-2xl',
          'transition-[transform,width] duration-200 ease-out motion-reduce:transition-none',
          'lg:max-w-none lg:translate-x-0 lg:shadow-none',
          'lg:border-e lg:border-sidebar-border',
          mobileOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full',
          collapsed ? 'lg:w-[4.75rem]' : 'lg:w-64',
        )}
      >
        <div
          className={clsx(
            'flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border',
            collapsed ? 'lg:justify-center lg:px-0' : '',
            'px-4',
          )}
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sidebar-accent/20 ring-1 ring-sidebar-border">
            {branding.logo_url ? (
              // Plain <img>: the logo URL is operator-supplied and can point anywhere,
              // which next/image would reject against the configured remotePatterns.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logo_url} alt="" className="h-full w-full object-contain" />
            ) : (
              <LayoutGrid className="h-5 w-5" />
            )}
          </span>

          <div className={clsx('min-w-0 flex-1 leading-tight', collapsed && 'lg:hidden')}>
            <h2 className="truncate text-sm font-semibold tracking-wide">
              {branding.project_name}
            </h2>
            {branding.tagline && (
              <p className="mt-0.5 truncate text-xs text-sidebar-foreground/60">
                {branding.tagline}
              </p>
            )}
          </div>

          {/* Drawer dismiss — the backdrop and Escape also close it, but a visible
              control is the only affordance a touch user can see. */}
          <button
            type="button"
            onClick={closeMobile}
            aria-label="Close navigation"
            className="-me-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/20 hover:text-sidebar-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden p-3">
          {loading && (
            <div className="space-y-2 px-1 py-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-8 animate-pulse rounded-md bg-sidebar-foreground/10"
                />
              ))}
            </div>
          )}

          {!loading && menus.length === 0 && (
            <div className={clsx('px-3 py-2 text-xs text-sidebar-foreground/50', collapsed && 'lg:hidden')}>
              No menus available
            </div>
          )}

          {!loading && menus.map((item) => {
            const href = toHref(item.url);
            const hasChildren = item.children.length > 0;
            const isOpen = openGroup === item.id && !rail;
            const active = !hasChildren && isActive(pathname, href);
            const groupActive = hasChildren && item.children.some((c) => isActive(pathname, toHref(c.url)));

            // Leaf top-level item -> simple link
            if (!hasChildren) {
              return (
                <Link
                  key={item.id}
                  href={href}
                  title={rail ? item.menu_name : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    collapsed && 'lg:justify-center lg:px-0',
                    active
                      ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-sm'
                      : 'text-sidebar-foreground/75 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground',
                  )}
                >
                  <MenuIcon icon={item.icon} label={item.menu_name} />
                  <span className={clsx('flex-1 truncate', collapsed && 'lg:hidden')}>
                    {item.menu_name}
                  </span>
                  <Badge text={item.badge} hidden={collapsed} />
                </Link>
              );
            }

            // Parent with children -> collapsible group
            return (
              <div key={item.id}>
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  aria-expanded={isOpen}
                  title={rail ? item.menu_name : undefined}
                  className={clsx(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    collapsed && 'lg:justify-center lg:px-0',
                    groupActive
                      ? 'bg-sidebar-foreground/10 text-sidebar-foreground'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground',
                  )}
                >
                  <MenuIcon icon={item.icon} label={item.menu_name} />
                  <span className={clsx('flex-1 truncate text-left', collapsed && 'lg:hidden')}>
                    {item.menu_name}
                  </span>
                  <Badge text={item.badge} hidden={collapsed} />
                  <ChevronDown
                    className={clsx(
                      'h-4 w-4 shrink-0 transition-transform',
                      isOpen ? 'rotate-180' : '',
                      collapsed && 'lg:hidden',
                    )}
                  />
                </button>

                {isOpen && (
                  <div className="ms-3 mt-0.5 space-y-0.5 border-s border-sidebar-border ps-2">
                    {item.children.map((child) => {
                      const childHref = toHref(child.url);
                      const childActive = isActive(pathname, childHref);
                      return (
                        <Link
                          key={child.id}
                          href={childHref}
                          aria-current={childActive ? 'page' : undefined}
                          className={clsx(
                            'flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors',
                            childActive
                              ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-sm'
                              : 'text-sidebar-foreground/60 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground',
                          )}
                        >
                          <span
                            className={clsx(
                              'h-1.5 w-1.5 shrink-0 rounded-full',
                              childActive ? 'bg-current' : 'bg-current opacity-50',
                            )}
                          />
                          <span className="flex-1 truncate">{child.menu_name}</span>
                          <Badge text={child.badge} />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div
          className={clsx(
            'shrink-0 border-t border-sidebar-border p-4 text-xs text-sidebar-foreground/50',
            collapsed && 'lg:hidden',
          )}
        >
          v0.1.0
        </div>
      </aside>
    </>
  );
}

// Tabler icon classes (`ti ti-...`) come from the menu master data. They render as
// <i className="ti ti-..."> via the webfont loaded in the root layout. Without an
// icon we fall back to the menu's initial, which stays meaningful in rail mode
// where the label is hidden.
function MenuIcon({ icon, label }: { icon: string | null | undefined; label: string }) {
  const cls = (icon || '').trim();
  if (cls) {
    return (
      <i className={clsx(cls, 'inline-flex h-5 w-5 shrink-0 items-center justify-center text-base')} />
    );
  }
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-sidebar-foreground/15 text-[10px] font-semibold uppercase">
      {label.trim().charAt(0) || '•'}
    </span>
  );
}

function Badge({ text, hidden }: { text: string | null | undefined; hidden?: boolean }) {
  const t = (text || '').trim();
  if (!t) return null;
  return (
    <span
      className={clsx(
        'rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] uppercase text-sidebar-accent-foreground',
        hidden && 'lg:hidden',
      )}
    >
      {t}
    </span>
  );
}
