'use client';

// The header's two inboxes: a BELL for alerts (a payment approved, an invoice
// validated, a fiche audited, a file cancelled) and a MESSAGE BOX for messages
// other roles sent. Each carries its own unread badge, because "three things
// happened in the system" and "three people wrote to you" are different news.
//
// The menu shows the newest few and nothing more — a dropdown is a glance, not a
// list. "Read more" opens the full inbox, filtered to that kind.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, MessageSquare, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDateTime } from '@/lib/formatDate';
import {
  fetchInbox,
  markNotificationsRead,
  subscribeUnreadCounts,
  type InboxItem,
  type NotificationKind,
} from '@/lib/notificationsClient';

/** The newest few, then "Read more" — the dropdown never becomes the list. */
const SHOWN = 6;

interface InboxMenuProps {
  kind: NotificationKind;
}

const COPY: Record<NotificationKind, { label: string; empty: string; none: string }> = {
  event: {
    label: 'Alerts',
    empty: 'No alerts yet — approvals, rejections and verifications land here.',
    none: 'No new alerts',
  },
  message: {
    label: 'Messages',
    empty: 'No messages for your role yet.',
    none: 'No new messages',
  },
};

export default function InboxMenu({ kind }: InboxMenuProps) {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeUnreadCounts((c) => setUnread(kind === 'message' ? c.messages : c.events)), [kind]);

  const load = async (): Promise<void> => {
    const res = await fetchInbox({ kind, pageSize: SHOWN });
    if ('error' in res) {
      setError(res.error);
      setItems([]);
      return;
    }
    setError(null);
    setItems(res.items);
  };

  const open = async (it: InboxItem): Promise<void> => {
    if (!it.read) await markNotificationsRead([it.id]);
    router.push(it.link_url ?? `/notifications?kind=${kind}`);
  };

  const copy = COPY[kind];
  const Icon = kind === 'message' ? MessageSquare : Bell;
  const badge = unread > 99 ? '99+' : String(unread);

  return (
    <DropdownMenu onOpenChange={(o) => { if (o) void load(); }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `${copy.label} — ${unread} unread` : copy.label}
          title={unread > 0 ? `${unread} new ${copy.label.toLowerCase()}` : copy.none}
        >
          <Icon className="h-[1.15rem] w-[1.15rem]" />
          {unread > 0 && (
            <span className="absolute -end-0.5 -top-0.5 min-w-[1.05rem] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[1.05rem] text-white ring-2 ring-white/50">
              {badge}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-[23rem] max-w-[calc(100vw-1rem)] overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 bg-brand-gradient px-4 py-3 text-white">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="h-4 w-4" /> {copy.label}
            {unread > 0 && (
              <span className="rounded-full bg-white/25 px-2 text-[11px] font-bold leading-5">{unread} new</span>
            )}
          </span>
          {unread > 0 && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); void markNotificationsRead('all', kind).then(() => void load()); }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-white/90 hover:bg-white/15 hover:text-white"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[22rem] overflow-y-auto">
          {items === null ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-2">
                  <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-1.5 py-1">
                    <div className="h-2.5 w-2/3 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <p className="px-4 py-5 text-sm text-destructive">{error}</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{copy.empty}</p>
          ) : (
            items.map((it) => (
              <DropdownMenuItem
                key={it.id}
                onSelect={() => void open(it)}
                className={`flex cursor-pointer items-start gap-3 rounded-none border-b border-border px-4 py-2.5 last:border-b-0 ${it.read ? '' : 'bg-primary-50/60'}`}
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    it.priority === 'high'
                      ? 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300'
                      : 'bg-primary-50 text-primary-600'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${it.read ? 'text-foreground' : 'font-semibold text-foreground'}`} title={it.title}>
                    {it.title}
                  </span>
                  <span className="line-clamp-2 block text-xs text-muted-foreground">{it.body}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {it.sender_name ? `${it.sender_name}${it.sender_role ? ` · ${it.sender_role}` : ''} — ` : ''}
                    {formatDateTime(it.created_at)}
                  </span>
                </span>
                {!it.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary-600" aria-label="Unread" />}
              </DropdownMenuItem>
            ))
          )}
        </div>

        <DropdownMenuItem
          onSelect={() => router.push(`/notifications?kind=${kind}`)}
          className="cursor-pointer justify-center border-t border-border py-2.5 text-sm font-semibold text-primary-600"
        >
          Read more
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
