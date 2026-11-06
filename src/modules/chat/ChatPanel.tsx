'use client';

// Live Chat: the contact list and one conversation. Rendered by the floating
// button (popup) and by the /chat page (full screen) — one component, so the two
// can never behave differently (§4.10).
//
// "Live" is polling, not a socket: a socket needs a server process this app does
// not run and a dependency it does not have (§12). Polls pause while the tab is
// hidden, and the open thread asks only for messages newer than the last one it
// holds, so a quiet conversation costs one tiny request every few seconds.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, Search, Send } from 'lucide-react';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import type { ChatContact, ChatMessage } from '@/db/queries/chat';
import { CHAT_MESSAGE_MAX } from '@/schemas/chat';
import { CHAT_CHANGED } from './chatEvents';

const CONTACTS_POLL_MS = 10_000;
const THREAD_POLL_MS = 4_000;

/** Runs `fn` now and every `ms` while the tab is visible. */
function usePoll(fn: () => void, ms: number, enabled: boolean): void {
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  }, [fn]);
  useEffect(() => {
    if (!enabled) return;
    const tick = (): void => {
      if (document.visibilityState === 'visible') saved.current();
    };
    tick();
    const id = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ms, enabled]);
}

/** Today's messages show the time alone; older ones carry the date too (§4.19). */
function stamp(iso: string): string {
  const full = formatDateTime(iso);
  return formatDate(iso) === formatDate(new Date().toISOString()) ? full.split(' ')[1] ?? full : full;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Initials disc, with a green dot in the corner while the person is online. */
function Avatar({ name, online }: { name: string; online: boolean }) {
  return (
    // The wrapper is a block of exactly the avatar's size, so the dot is placed
    // against the circle itself — an inline wrapper sizes to the text line and
    // the dot drifts off the edge.
    <span className="relative block h-9 w-9 shrink-0">
      <span className="bg-brand-gradient flex h-full w-full items-center justify-center rounded-full text-xs font-semibold text-white">
        {initials(name)}
      </span>
      {online && (
        <span
          className="absolute bottom-0 end-0 block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card"
          title="Online"
        >
          <span className="sr-only">Online</span>
        </span>
      )}
    </span>
  );
}

interface ChatPanelProps {
  /** `popup` is the corner window; `page` fills the /chat screen. */
  variant: 'popup' | 'page';
}

export default function ChatPanel({ variant }: ChatPanelProps) {
  const [contacts, setContacts] = useState<ChatContact[] | null>(null);
  const [canSend, setCanSend] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);

  const loadContacts = useCallback(async (): Promise<void> => {
    const res = await safeFetchJson<ChatContact[]>('/api/v1/chat/contacts');
    if (!res.ok) {
      setListError(res.message);
      return;
    }
    setListError(null);
    setContacts(res.data);
    setCanSend(res.meta?.['can_send'] !== false);
  }, []);

  usePoll(() => void loadContacts(), CONTACTS_POLL_MS, true);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!contacts || !needle) return contacts ?? [];
    return contacts.filter(
      (c) => c.full_name.toLowerCase().includes(needle) || (c.role_name ?? '').toLowerCase().includes(needle),
    );
  }, [contacts, q]);

  const active = contacts?.find((c) => c.user_id === activeId) ?? null;

  // The page shows both panes side by side from `md` up; the popup is too narrow
  // for that, so it shows one pane at a time.
  const split = variant === 'page';

  const list = (
    <div className={`flex min-h-0 flex-col ${split ? 'md:w-80 md:border-e md:border-border' : ''} flex-1 md:flex-none`}>
      <div className="relative border-b border-border p-2">
        <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="input h-9 ps-8"
          placeholder="Search name, role..."
          aria-label="Search contacts"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {listError && <p className="p-4 text-sm text-red-600 dark:text-red-400">{listError}</p>}
        {!listError && contacts === null && (
          <div className="space-y-2 p-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        )}
        {contacts !== null && filtered.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            {contacts.length === 0
              ? 'Nobody else can use Live Chat yet — an administrator grants it per role under Mapping → Role to Menu.'
              : 'No one matches that search.'}
          </p>
        )}
        <ul>
          {filtered.map((c) => (
            <li key={c.user_id}>
              <button
                type="button"
                onClick={() => setActiveId(c.user_id)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors hover:bg-muted/50 ${
                  c.user_id === activeId ? 'bg-muted' : ''
                }`}
              >
                <Avatar name={c.full_name} online={c.online} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-foreground" translate="no" title={c.full_name}>
                      {c.full_name}
                    </span>
                    {c.last_at && <span className="shrink-0 text-[11px] text-muted-foreground">{stamp(c.last_at)}</span>}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">
                      {c.last_body ? `${c.last_from_me ? 'You: ' : ''}${c.last_body}` : c.role_name ?? ''}
                    </span>
                    {c.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                        {c.unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  const thread = active ? (
    <Thread
      key={active.user_id}
      contact={active}
      canSend={canSend}
      onBack={() => setActiveId(null)}
      showBack={!split}
      onActivity={() => void loadContacts()}
    />
  ) : (
    <div className="hidden flex-1 items-center justify-center p-6 text-sm text-muted-foreground md:flex">
      Choose someone on the left to start chatting.
    </div>
  );

  if (split) {
    return (
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className={`${active ? 'hidden md:flex' : 'flex'} min-h-0 flex-1 flex-col md:flex-none`}>{list}</div>
        <div className={`${active ? 'flex' : 'hidden md:flex'} min-h-0 flex-1 flex-col`}>{thread}</div>
      </div>
    );
  }
  return <div className="flex min-h-0 flex-1 flex-col">{active ? thread : list}</div>;
}

interface ThreadProps {
  contact: ChatContact;
  canSend: boolean;
  showBack: boolean;
  onBack: () => void;
  /** Something was read or sent — the list's previews and badges are stale. */
  onActivity: () => void;
}

function Thread({ contact, canSend, showBack, onBack, onActivity }: ThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastId = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const after = lastId.current ? `&after=${lastId.current}` : '';
    const res = await safeFetchJson<ChatMessage[]>(`/api/v1/chat/messages?with=${contact.user_id}${after}`);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    const fresh = res.data;
    if (fresh.length) lastId.current = fresh[fresh.length - 1]!.id;
    // A poll and a send can both fetch the same new message, so append by id.
    setMessages((prev) => {
      if (!prev || !after) return fresh;
      const seen = new Set(prev.map((m) => m.id));
      return [...prev, ...fresh.filter((m) => !seen.has(m.id))];
    });
    // Opening the thread marked its messages read on the server.
    if (fresh.some((m) => m.sender_user_id === contact.user_id)) {
      window.dispatchEvent(new Event(CHAT_CHANGED));
      onActivity();
    }
  }, [contact.user_id, onActivity]);

  usePoll(() => void load(), THREAD_POLL_MS, true);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);

  const send = async (): Promise<void> => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    const res = await safeFetchJson<ChatMessage>('/api/v1/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: contact.user_id, body }),
    });
    setSending(false);
    if (!res.ok) {
      // The draft stays in the box, so nothing typed is lost to a failed send.
      setSendError(res.message);
      return;
    }
    setDraft('');
    await load();
    onActivity();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter sends; Shift+Enter is a new line, as in every chat client.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {showBack && (
          <button type="button" onClick={onBack} className="btn-neutral btn-icon" title="Back to contacts" aria-label="Back to contacts">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <Avatar name={contact.full_name} online={contact.online} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground" translate="no" title={contact.full_name}>
            {contact.full_name}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {contact.online && <span className="font-medium text-emerald-600 dark:text-emerald-400">Online</span>}
            {contact.online && contact.role_name && ' · '}
            {contact.role_name}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/30 p-3" aria-live="polite">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!error && messages === null && <div className="h-10 w-2/3 animate-pulse rounded-lg bg-muted" aria-hidden />}
        {messages?.length === 0 && (
          <p className="pt-6 text-center text-sm text-muted-foreground">No messages yet — say hello.</p>
        )}
        {messages?.map((m) => {
          const mine = m.sender_user_id !== contact.user_id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  mine ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm border border-border bg-card text-foreground'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-1 text-end text-[10px] ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {stamp(m.created_at)}
                  {mine && (m.read_at ? ' · Seen' : '')}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {canSend ? (
        <div className="border-t border-border p-2">
          <div className="flex items-end gap-2">
            <textarea
              className="input min-h-[2.5rem] min-w-0 flex-1 resize-none py-2"
              rows={1}
              maxLength={CHAT_MESSAGE_MAX}
              placeholder="Type a message — Enter to send"
              aria-label={`Message to ${contact.full_name}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !draft.trim()}
              className="btn-primary h-10 w-10 shrink-0 justify-center p-0"
              title="Send"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          {sendError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Not sent: {sendError}</p>}
        </div>
      ) : (
        <p className="border-t border-border p-3 text-xs text-muted-foreground">
          Your role can read Live Chat but not send — an administrator can allow sending under Mapping → Role to Menu (Add).
        </p>
      )}
    </div>
  );
}
