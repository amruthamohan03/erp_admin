'use client';

// The Live Chat button in the bottom-right corner of every screen, and the
// window it opens.
//
// Shown only when the signed-in role has the `/chat` menu — the same role-scoped
// tree the sidebar draws, so switching Live Chat off for a role in Role → Menu
// removes the button with no code change (§4.1, §4.7). Hidden on /chat itself,
// where the full-screen chat is already open.
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Maximize2, MessageCircle, X } from 'lucide-react';
import { useMenus } from '@/components/layout/MenuProvider';
import { normalisePath, resolveMenuTitle } from '@/lib/pageTitle';
import { safeFetchJson } from '@/lib/safeFetch';
import ChatPanel from './ChatPanel';
import { CHAT_CHANGED } from './chatEvents';

const CHAT_PATH = '/chat';
const BADGE_POLL_MS = 15_000;

export default function ChatWidget() {
  const pathname = usePathname();
  const { menus } = useMenus();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  // The menu's own name, so renaming the menu renames the window (§4.1).
  const title = resolveMenuTitle(CHAT_PATH, menus);
  const enabled = title !== null && normalisePath(pathname) !== CHAT_PATH;

  const refresh = useCallback(async (): Promise<void> => {
    const res = await safeFetchJson<{ unread: number }>('/api/v1/chat/unread-count');
    if (res.ok) setUnread(res.data.unread);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const tick = (): void => {
      if (document.visibilityState === 'visible') void refresh();
    };
    tick();
    const id = setInterval(tick, BADGE_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener(CHAT_CHANGED, tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener(CHAT_CHANGED, tick);
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!enabled) return null;

  return (
    // bottom-20 keeps the button clear of a transaction page's sticky Save bar.
    <div className="fixed bottom-20 end-5 z-40 flex flex-col items-end gap-3 print:hidden">
      {open && (
        <div
          role="dialog"
          aria-label={title}
          className="flex h-[min(32rem,calc(100vh-9rem))] w-[min(22rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        >
          <div className="bg-brand-gradient flex items-center justify-between gap-2 px-3 py-2 text-white">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <MessageCircle className="h-4 w-4" />
              {title}
            </span>
            <span className="flex items-center gap-1">
              <Link
                href={CHAT_PATH}
                onClick={() => setOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/15"
                title="Open full screen"
                aria-label="Open full screen"
              >
                <Maximize2 className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/15"
                title="Close"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </span>
          </div>
          <ChatPanel variant="popup" />
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="bg-brand-gradient relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg ring-1 ring-white/30 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={open ? `Close ${title}` : title}
        aria-label={unread ? `${title} — ${unread} unread` : title}
        aria-expanded={open}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {unread > 0 && !open && (
          <span className="absolute -end-1 -top-1 min-w-[1.25rem] rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white ring-2 ring-background">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}
