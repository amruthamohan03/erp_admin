'use client';

// Communication → Messages: write to one or more roles. The message lands in
// every member's inbox — the message-box icon in the header, /notifications and
// the dashboard panel. Below, what this user has sent and how many have read it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare, Send, Users } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import MultiSelect from '@/components/ui/MultiSelect';
import SearchableSelect from '@/components/ui/SearchableSelect';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { fetchMasterOptions } from '@/lib/selectOptions';
import { formatDateTime } from '@/lib/formatDate';

interface SentRow {
  id: number;
  title: string;
  body: string;
  priority: 'normal' | 'high';
  created_at: string;
  roles: string | null;
  read_count: number;
}

const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];
const SUBJECT_MAX = 200;
const BODY_MAX = 4000;

export default function MessagesPage() {
  const [roles, setRoles] = useState<{ value: string; label: string }[]>([]);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [priority, setPriority] = useState('normal');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [sent, setSent] = useState<SentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchMasterOptions('roles', 'role_name').then((o) => setRoles(o.map((r) => ({ value: String(r.id), label: r.label }))));
  }, []);

  const loadSent = useCallback(async () => {
    setLoading(true);
    const res = await safeFetchJson<SentRow[]>('/api/v1/messages');
    setSent(res.ok ? res.data : []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void loadSent();
  }, [loadSent]);

  const missing = useMemo(
    () => (roleIds.length === 0 ? 'role_ids' : !subject.trim() ? 'subject' : !body.trim() ? 'body' : null),
    [roleIds, subject, body],
  );
  const recipients = useMemo(
    () => roles.filter((r) => roleIds.includes(r.value)).map((r) => r.label),
    [roles, roleIds],
  );

  const send = async (): Promise<void> => {
    if (missing) {
      setInvalid(missing);
      return;
    }
    setInvalid(null);
    setSending(true);
    const res = await safeFetchJson<{ id: number; roles: string[] }>('/api/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_ids: roleIds.map(Number), subject, body, priority }),
    });
    setSending(false);
    if (!res.ok) {
      setInvalid(res.field ?? null);
      setResult({ status: 'error', title: 'Not sent', message: res.message || 'The message could not be sent.' });
      return;
    }
    setResult({ status: 'success', title: 'Sent', message: `Your message "${subject.trim()}" was sent to ${res.data.roles.join(', ')}.` });
    setRoleIds([]);
    setSubject('');
    setBody('');
    setPriority('normal');
    void loadSent();
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <MessageSquare className="h-5 w-5 text-primary-600" /> Messages
        </h1>
        <p className="text-sm text-muted-foreground">Write to a role; everyone in it sees the message in their inbox.</p>
      </div>

      <div className="card mb-4 overflow-hidden">
        <div className="flex items-center gap-2 bg-brand-gradient px-4 py-3 text-white">
          <Send className="h-4 w-4" />
          <h2 className="text-sm font-semibold">New message</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
          <div className="min-w-0 md:col-span-3">
            <label className="label required">To (roles)</label>
            <MultiSelect
              values={roleIds}
              onChange={setRoleIds}
              options={roles}
              placeholder="Choose the roles to message"
              noun="roles"
              emptyText="No roles"
              required
              invalid={invalid === 'role_ids'}
              aria-label="To (roles)"
            />
            {recipients.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                {recipients.slice(0, 8).map((r) => (
                  <span key={r} className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                    {r}
                  </span>
                ))}
                {recipients.length > 8 && (
                  <span className="text-xs text-muted-foreground">+{recipients.length - 8} more</span>
                )}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <label className="label required">Priority</label>
            <SearchableSelect value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} aria-label="Priority" />
          </div>
          <div className="min-w-0 md:col-span-4">
            <label htmlFor="msg-subject" className="label required">Subject</label>
            <input
              id="msg-subject"
              className="input"
              value={subject}
              maxLength={SUBJECT_MAX}
              onChange={(e) => setSubject(e.target.value)}
              required
              aria-invalid={invalid === 'subject' || undefined}
              placeholder="What is it about?"
            />
          </div>
          <div className="min-w-0 md:col-span-4">
            <label htmlFor="msg-body" className="label required">Message</label>
            <textarea
              id="msg-body"
              className="input min-h-[140px]"
              value={body}
              maxLength={BODY_MAX}
              onChange={(e) => setBody(e.target.value)}
              required
              aria-invalid={invalid === 'body' || undefined}
              placeholder="Write your message"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{body.length} / {BODY_MAX}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {invalid
              ? 'Fill in the fields marked in red.'
              : recipients.length > 0
                ? `Goes to every member of ${recipients.length} role${recipients.length === 1 ? '' : 's'}.`
                : 'Every member of the chosen roles sees it in their inbox and on their dashboard.'}
          </p>
          <button type="button" onClick={() => void send()} disabled={sending} className="btn-primary">
            <Send className="h-4 w-4" /> {sending ? 'Sending…' : 'Send message'}
          </button>
        </div>
      </div>

      <DataTable<SentRow>
        rows={sent}
        loading={loading}
        rowKey={(r) => r.id}
        title="Sent messages"
        searchPlaceholder="Search subject, message, roles, date..."
        emptyMessage="You have not sent a message yet — write one above."
        columns={[
          {
            key: 'title',
            header: 'Subject',
            render: (r) => (
              <span className="block min-w-0">
                <span className="flex items-center gap-1.5 font-medium">
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
          {
            key: 'roles',
            header: 'To',
            render: (r) => <span className="block max-w-xs truncate" title={r.roles ?? ''}>{r.roles ?? '—'}</span>,
          },
          { key: 'created_at', header: 'Sent', render: (r) => formatDateTime(r.created_at) },
          {
            key: 'read_count',
            header: 'Read by',
            align: 'right',
            render: (r) => (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                {r.read_count}
              </span>
            ),
          },
        ]}
      />

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
