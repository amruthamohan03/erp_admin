'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

// Shell navigation state, shared by the Sidebar (which renders it) and the Topbar
// (which holds the hamburger and the rail toggle). Two independent axes:
//
//   mobileOpen — below `lg`, the sidebar is an overlay drawer that starts closed.
//   collapsed  — at `lg` and up, the sidebar is docked and can shrink to an icon rail.
//
// Only `collapsed` is a preference worth remembering; `mobileOpen` is transient and
// always starts closed on a fresh page.

const COLLAPSED_KEY = 'erp.sidebar.collapsed';

// Matches Tailwind's `lg`. The CSS side of the rail is driven by `lg:` variants; this
// is for the JS decisions that can't be expressed as a class (see `rail` below).
const DESKTOP_QUERY = '(min-width: 1024px)';

interface SidebarState {
  mobileOpen: boolean;
  openMobile: () => void;
  closeMobile: () => void;
  toggleMobile: () => void;
  /** The stored preference. Use for `lg:`-prefixed classes only. */
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  toggleCollapsed: () => void;
  /**
   * Whether the sidebar is *actually* a rail right now. The drawer is always full
   * width, so behaviour keyed off `collapsed` alone would wrongly treat a phone as
   * collapsed whenever the desktop preference happened to be set.
   */
  rail: boolean;
}

const SidebarContext = createContext<SidebarState | null>(null);

export function useSidebar(): SidebarState {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used inside <SidebarProvider>');
  return ctx;
}

export default function SidebarProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsedState] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Restore the rail preference after hydration. Server and client both start from
  // `false`, so the markup matches; the width transition makes the restore read as a
  // deliberate animation rather than a flash.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (window.localStorage.getItem(COLLAPSED_KEY) === '1') setCollapsedState(true);
    } catch {
      // Storage can be unavailable (private mode, blocked cookies) — the default stands.
    }
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
    } catch {
      // Preference just won't persist; the current session still works.
    }
  }, []);

  // Tapping a menu item should navigate *and* get the drawer out of the way.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  // While the drawer covers the page, Escape dismisses it and the page behind it
  // must not scroll — otherwise a swipe on the backdrop moves the wrong surface.
  useEffect(() => {
    if (!mobileOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false);
    }

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  const value = useMemo<SidebarState>(
    () => ({
      mobileOpen,
      openMobile: () => setMobileOpen(true),
      closeMobile: () => setMobileOpen(false),
      toggleMobile: () => setMobileOpen((open) => !open),
      collapsed,
      setCollapsed,
      toggleCollapsed: () => setCollapsed(!collapsed),
      rail: collapsed && isDesktop,
    }),
    [mobileOpen, collapsed, isDesktop, setCollapsed],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}
