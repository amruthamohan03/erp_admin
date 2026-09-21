'use client';

// Communication → Notifications: this user's whole inbox — alerts raised when
// records change status, and messages other roles sent to theirs. Opening one
// marks it read for this user only.
//
// The cards at the top are the same two counts the header icons carry, and each
// one filters the list below it (§4.29 — a figure you can click through to).
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bell, CheckCheck, ExternalLink, Inbox, MessageSquare, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import StatCard from '@/components/ui/StatCard';
import Toggle from '@/components/ui/Toggle';
import { formatDateTime } from '@/lib/formatDate';
import {
  INBOX_CHANGED,
  fetchInbox,
  markNotificationsRead,
  subscribeUnreadCounts,
  type InboxItem,
  type NotificationKind,
  type UnreadCounts,
} from '@/lib/notificationsClient';
import StatusBadge from '@/components/ui/StatusBadge';

// useSearchParams needs a Suspense boundary for the static build.
export default function NotificationsPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
      <NotificationsInbox />
    </Suspense>
  );
}

function NotificationsInbox() {
  const router = useRouter();
  const params = useSearchParams();
  const [kind, setKind] = useState<NotificationKind | ''>(
    params.get('kind') === 'message' || params.get('kind') === 'event' ? (params.get('kind') as NotificationKind) : '',
  );
  const [unread, setUnread] = useState(false);
  const [counts, setCounts] = useState<UnreadCounts>({ total: 0, messages: 0, events: 0 });
  const [items, setItems] = useState<InboxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<InboxItem | null>(null);

  useEffect(() => subscribeUnreadCounts(setCounts), []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchInbox({ kind: kind || undefined, unread, q: search, page, pageSize });
    setLoading(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    setError(null);
    setItems(res.items);
    setTotal(res.total);
  }, [kind, unread, search, page, pageSize]);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener(INBOX_CHANGED, onChange);
    return () => window.removeEventListener(INBOX_CHANGED, onChange);
  }, [load]);

  const view = async (it: InboxItem): Promise<void> => {
    setOpen(it);
    if (!it.read) await markNotificationsRead([it.id]);
  };

  /** A card both filters and clears its own filter when pressed again. */
  const pick = (next: NotificationKind | '', onlyUnread: boolean): void => {
    setKind(next);
    setUnread(onlyUnread);
    setPage(1);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Inbox className="h-5 w-5 text-primary-600" /> Notifications
        </h1>
        <p className="text-sm text-muted-foreground">
          Alerts from the modules you work in, and messages sent to your role.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Inbox className="h-5 w-5" />}
          label="Everything"
          value={total}
          active={kind === '' && !unread}
          title="Show every notification"
          onClick={() => pick('', false)}
        />
        <StatCard
          icon={<MessageSquare className="h-5 w-5" />}
          label="Unread messages"
          value={counts.messages}
          active={kind === 'message' && unread}
          title="Show unread messages"
          onClick={() => pick('message', true)}
        />
        <StatCard
          icon={<Bell className="h-5 w-5" />}
          label="Unread alerts"
          value={counts.events}
          active={kind === 'event' && unread}
          title="Show unread alerts"
          onClick={() => pick('event', true)}
        />
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <DataTable<InboxItem>
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        title={kind === 'message' ? 'Messages' : kind === 'event' ? 'Alerts' : 'Inbox'}
        searchPlaceholder="Search subject, message, sender, role, date..."
        emptyMessage={
          unread
            ? 'Nothing unread — you are all caught up.'
            : 'Nothing here yet — alerts and messages for your role will appear here.'
        }
        filters={<Toggle size="sm" checked={unread} onChange={(v) => { setUnread(v); setPage(1); }} label="Unread only" />}
        toolbar={
          <button
            type="button"
            onClick={() => void markNotificationsRead('all', kind || undefined)}
            className="btn-neutral btn-sm"
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        }
        columns={[
          {
            key: 'kind',
            header: '',
            className: 'w-10',
            value: (r) => (r.kind === 'message' ? 'Message' : 'Alert'),
            render: (r) => (
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  r.priority === 'high'
                    ? 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300'
                    : 'bg-primary-50 text-primary-600'
                }`}
                title={r.kind === 'message' ? 'Message' : 'Alert'}
              >
                {r.kind === 'message' ? <MessageSquare className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              </span>
            ),
          },
          {
            key: 'title',
            header: 'Subject',
            render: (r) => (
              <span className="block min-w-0">
                <span className={`flex items-center gap-1.5 ${r.read ? '' : 'font-semibold'}`}>
                  {!r.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary-600" aria-label="Unread" />}
                  {r.priority === 'high' && (
                    <span className="rounded border border-red-200 bg-red-50 px-1 text-[10px] font-bold uppercase text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                      High
                    </span>
                  )}
                  <span className="truncate" title={r.title}>{r.title}</span>
                </span>
                <span className="mt-0.5 block max-w-xl truncate text-xs text-muted-foreground" title={r.body}>
                  {r.body}
                </span>
              </span>
            ),
          },
          { key: 'module', header: 'Module', render: (r) => r.module ?? '—' },
          {
            key: 'sender_name',
            header: 'From',
            value: (r) => `${r.sender_name ?? ''} ${r.sender_role ?? ''}`,
            render: (r) =>
              r.sender_name ? (
                <span className="block">
                  <span className="block truncate">{r.sender_name}</span>
                  {r.sender_role && <span className="block truncate text-xs text-muted-foreground">{r.sender_role}</span>}
                </span>
              ) : (
                <span className="text-muted-foreground">System</span>
              ),
          },
          { key: 'created_at', header: 'Received', render: (r) => formatDateTime(r.created_at) },
          {
            key: 'read',
            header: 'Status',
            value: (r) => (r.read ? 'Read' : 'Unread'),
            // Unread is what needs attention; read has been dealt with.
            render: (r) => <StatusBadge status={r.read ? 'Read' : 'Unread'} tone={r.read ? 'slate' : 'blue'} />,
          },
        ]}
        actions={(r) => ({ view: () => void view(r) })}
        server={{
          page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
          search,
          onSearchChange: (q) => { setSearch(q); setPage(1); },
        }}
      />

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notification-title"
        >
          <div className="card w-full max-w-lg overflow-hidden">
            <div className="flex items-start justify-between gap-3 bg-brand-gradient px-5 py-4 text-white">
              <span className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
                  {open.kind === 'message' ? <MessageSquare className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <h2 id="notification-title" className="truncate font-semibold" title={open.title}>{open.title}</h2>
                  <span className="block text-xs text-white/80">
                    {open.sender_name ? `${open.sender_name}${open.sender_role ? ` · ${open.sender_role}` : ''}` : 'System'}
                    {' — '}
                    {formatDateTime(open.created_at)}
                    {open.module ? ` — ${open.module}` : ''}
                  </span>
                </span>
              </span>
              <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="shrink-0 rounded p-1 hover:bg-white/15">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              {open.priority === 'high' && (
                <p className="mb-2 inline-block rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold uppercase text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  High priority
                </p>
              )}
              <p className="whitespace-pre-wrap break-words text-sm text-foreground">{open.body}</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button type="button" onClick={() => setOpen(null)} className="btn-secondary">Close</button>
              {open.link_url && (
                <button type="button" onClick={() => router.push(open.link_url!)} className="btn-primary">
                  <ExternalLink className="h-4 w-4" /> Open
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
