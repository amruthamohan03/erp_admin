'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Circle } from 'lucide-react';
import clsx from 'clsx';
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
  const [menus, setMenus] = useState<MenuTreeNode[]>([]);
  const [openGroups, setOpenGroups] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/menus')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setMenus(j.data);
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

  useEffect(() => {
    if (activeParentId != null) {
      setOpenGroups((prev) => {
        if (prev.has(activeParentId)) return prev;
        const next = new Set(prev);
        next.add(activeParentId);
        return next;
      });
    }
  }, [activeParentId]);

  function toggle(id: number) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 min-h-screen flex flex-col">
      <div className="px-6 py-5 border-b border-slate-800">
        <h2 className="text-lg font-semibold">ERP Admin Panel</h2>
        <p className="text-xs text-slate-400 mt-0.5">Management Console</p>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {loading && (
          <div className="text-xs text-slate-500 px-3 py-2">Loading menu...</div>
        )}

        {!loading && menus.length === 0 && (
          <div className="text-xs text-slate-500 px-3 py-2">No menus available</div>
        )}

        {!loading && menus.map((item) => {
          const href = toHref(item.url);
          const hasChildren = item.children.length > 0;
          const isOpen = openGroups.has(item.id);
          const active = !hasChildren && isActive(pathname, href);
          const groupActive = hasChildren && item.children.some((c) => isActive(pathname, toHref(c.url)));

          // Leaf top-level item -> simple link
          if (!hasChildren) {
            return (
              <Link
                key={item.id}
                href={href}
                className={clsx(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                )}
              >
                <MenuIcon icon={item.icon} fallback />
                <span className="flex-1 truncate">{item.menu_name}</span>
                <Badge text={item.badge} />
              </Link>
            );
          }

          // Parent with children -> collapsible group
          return (
            <div key={item.id}>
              <button
                type="button"
                onClick={() => toggle(item.id)}
                className={clsx(
                  'w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  groupActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                )}
              >
                <MenuIcon icon={item.icon} fallback />
                <span className="flex-1 truncate text-left">{item.menu_name}</span>
                <Badge text={item.badge} />
                <ChevronDown
                  className={clsx(
                    'h-4 w-4 transition-transform',
                    isOpen ? 'rotate-180' : '',
                  )}
                />
              </button>

              {isOpen && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-800 pl-2">
                  {item.children.map((child) => {
                    const childHref = toHref(child.url);
                    const childActive = isActive(pathname, childHref);
                    return (
                      <Link
                        key={child.id}
                        href={childHref}
                        className={clsx(
                          'flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors',
                          childActive
                            ? 'bg-primary-600 text-white'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                        )}
                      >
                        <Circle className="h-1.5 w-1.5 fill-current opacity-70" />
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

      <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
        v0.1.0
      </div>
    </aside>
  );
}

// Tabler icon classes (`ti ti-...`) come from your old data.
// They render as <i className="ti ti-..."> if you have the Tabler webfont loaded.
// If not, we just show a small dot so layout doesn't break.
function MenuIcon({
  icon,
  fallback,
}: {
  icon: string | null | undefined;
  fallback?: boolean;
}) {
  const cls = (icon || '').trim();
  if (cls) {
    return <i className={clsx(cls, 'text-base w-4 h-4 inline-flex items-center justify-center')} />;
  }
  if (fallback) {
    return <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-500" />;
  }
  return null;
}

function Badge({ text }: { text: string | null | undefined }) {
  const t = (text || '').trim();
  if (!t) return null;
  return (
    <span className="text-[10px] uppercase rounded bg-primary-500/20 text-primary-100 px-1.5 py-0.5">
      {t}
    </span>
  );
}
