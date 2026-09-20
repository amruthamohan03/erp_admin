// The browser side of the inbox — shared by the header bell, the dashboard
// panel and /notifications, so the three never disagree about what is unread.
import { safeFetchJson } from '@/lib/safeFetch';

export type NotificationKind = 'event' | 'message';

export interface InboxItem {
  id: number;
  kind: NotificationKind;
  event_key: string | null;
  module: string | null;
  title: string;
  body: string;
  link_url: string | null;
  priority: 'normal' | 'high';
  sender_name: string | null;
  sender_role: string | null;
  created_at: string;
  read: boolean;
}

export interface UnreadCounts {
  total: number;
  messages: number;
  events: number;
}

/** Fired after anything is marked read, so every inbox view refreshes together. */
export const INBOX_CHANGED = 'erp:inbox-changed';

export async function fetchInbox(params: {
  kind?: NotificationKind;
  unread?: boolean;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: InboxItem[]; total: number } | { error: string }> {
  const p = new URLSearchParams({ page: String(params.page ?? 1), pageSize: String(params.pageSize ?? 10) });
  if (params.kind) p.set('kind', params.kind);
  if (params.unread) p.set('unread', 'true');
  if (params.q?.trim()) p.set('q', params.q.trim());
  const res = await safeFetchJson<InboxItem[]>(`/api/v1/notifications?${p}`);
  if (!res.ok) return { error: res.message };
  return { items: res.data, total: Number(res.meta?.['total'] ?? res.data.length) };
}

export async function fetchUnreadCounts(): Promise<UnreadCounts | null> {
  const res = await safeFetchJson<UnreadCounts>('/api/v1/notifications/unread-count');
  return res.ok ? res.data : null;
}

// ---------------------------------------------------------------------------
// The shared unread count
// ---------------------------------------------------------------------------
//
// The header shows two icons — alerts and messages — and the dashboard panel
// shows the same figures again. They subscribe to ONE poll rather than each
// asking on their own timer: three callers would otherwise mean three requests a
// minute for one number, and badges that tick over at different moments.

const POLL_MS = 60_000;
let counts: UnreadCounts = { total: 0, messages: 0, events: 0 };
const subscribers = new Set<(c: UnreadCounts) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

export async function refreshUnreadCounts(): Promise<void> {
  const next = await fetchUnreadCounts();
  if (!next) return;
  counts = next;
  for (const cb of subscribers) cb(counts);
}

/** Subscribe to the unread counts. Returns an unsubscribe function. */
export function subscribeUnreadCounts(cb: (c: UnreadCounts) => void): () => void {
  subscribers.add(cb);
  cb(counts);
  if (subscribers.size === 1) {
    void refreshUnreadCounts();
    timer = setInterval(() => void refreshUnreadCounts(), POLL_MS);
    // Coming back to the tab is the moment a stale badge is most obvious, and
    // anything marked read anywhere in the app re-reads the same number.
    window.addEventListener('focus', onWake);
    window.addEventListener(INBOX_CHANGED, onWake);
  }
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      window.removeEventListener('focus', onWake);
      window.removeEventListener(INBOX_CHANGED, onWake);
    }
  };
}

const onWake = (): void => {
  void refreshUnreadCounts();
};

export async function markNotificationsRead(ids: number[] | 'all', kind?: NotificationKind): Promise<boolean> {
  const res = await safeFetchJson('/api/v1/notifications/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids === 'all' ? { all: true, kind } : { ids }),
  });
  if (res.ok && typeof window !== 'undefined') window.dispatchEvent(new Event(INBOX_CHANGED));
  return res.ok;
}
