'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { MenuTreeNode } from '@/types/menu';

// The role-scoped sidebar tree, fetched ONCE for the whole shell.
//
// The Sidebar owned this fetch privately, which was fine while it was the only
// consumer. The browser-tab title reads the same tree — a screen's name is its
// menu name (§4.1) — and a second component issuing the same request on every
// page load is the duplication §4.10 exists to prevent. It would also be able to
// disagree with the sidebar for as long as the two responses differed.

interface MenuContextValue {
  menus: MenuTreeNode[];
  loading: boolean;
}

const MenuContext = createContext<MenuContextValue>({ menus: [], loading: true });

export function useMenus(): MenuContextValue {
  return useContext(MenuContext);
}

export default function MenuProvider({ children }: { children: ReactNode }) {
  const [menus, setMenus] = useState<MenuTreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/menus')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) setMenus(j.data as MenuTreeNode[]);
      })
      .catch(() => {
        // A sidebar that cannot load is a visible failure on its own; the title
        // falls back to the path, so neither needs to throw here.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <MenuContext.Provider value={{ menus, loading }}>{children}</MenuContext.Provider>;
}
