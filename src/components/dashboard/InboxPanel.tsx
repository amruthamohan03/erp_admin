'use client';

// Dashboard — what reached this user's role: the latest messages other roles
// sent, and the latest alerts raised by status changes (approvals, rejections,
// verifications, cancellations). Unread first catches the eye; opening one marks
// it read and follows its link. The full inbox is /notifications.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, MessageSquare } from 'lucide-react';
import { formatDateTime } from '@/lib/formatDate';
import {
  INBOX_CHANGED,
  fetchInbox,
  markNotificationsRead,
  type InboxItem,
  type NotificationKind,
} from '@/lib/notificationsClient';

const SHOWN = 5;

function Column({ kind, title, empty }: { kind: NotificationKind; title: string; empty: string }) {
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [latest, unreadOnly] = await Promise.all([
      fetchInbox({ kind, pageSize: SHOWN }),
      fetchInbox({ kind, unread: true, pageSize: 1 }),
    ]);
    if ('error' in latest) {
      setError(latest.error);
      setItems([]);
      return;
    }
    setError(null);
    setItems(latest.items);
    setUnread('error' in unreadOnly ? 0 : unreadOnly.total);
  }, [kind]);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener(INBOX_CHANGED, onChange);
    return () => window.removeEventListener(INBOX_CHANGED, onChange);
  }, [load]);

  const open = async (it: InboxItem): Promise<void> => {
    if (!it.read) await markNotificationsRead([it.id]);
    router.push(it.link_url ?? `/notifications?kind=${kind}`);
  };

  const Icon = kind === 'message' ? MessageSquare : Bell;

  return (
    <div className="card flex min-w-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 bg-brand-gradient px-4 py-2.5 text-white">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4" /> {title}
          {unread > 0 && (
            <span className="rounded-full bg-white/25 px-2 text-[11px] font-bold leading-5">{unread} new</span>
          )}
        </h3>
        <Link href={`/notifications?kind=${kind}`} className="rounded px-1.5 py-0.5 text-xs font-medium text-white/90 hover:bg-white/15 hover:text-white">
          Read more
        </Link>
      </div>
      <div className="p-3">
      {items === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => void open(it)}
                className={`flex w-full items-start gap-2 rounded px-1 py-2 text-left hover:bg-muted/50 ${it.read ? '' : 'bg-muted/40'}`}
              >
                {!it.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-600" aria-label="Unread" />}
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm text-foreground ${it.read ? '' : 'font-semibold'}`} title={it.title}>
                    {it.priority === 'high' && <span className="me-1 text-red-600 dark:text-red-300">●</span>}
                    {it.title}
                  </div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">{it.body}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {it.sender_name ? `${it.sender_name}${it.sender_role ? ` · ${it.sender_role}` : ''} — ` : ''}
                    {formatDateTime(it.created_at)}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  );
}

export default function InboxPanel() {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-lg font-semibold text-foreground">For your role</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Column kind="message" title="Messages" empty="No messages for your role yet." />
        <Column kind="event" title="Alerts" empty="No alerts yet — approvals, rejections and verifications will appear here." />
      </div>
    </section>
  );
}
