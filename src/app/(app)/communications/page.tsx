'use client';

// Communication → Email & WhatsApp: write to clients, users, or any address or
// number, with a formatted body and attachments. Below, every message sent —
// from here, from a stage list's mail / WhatsApp buttons, or automatically at
// a stage (Masters → Communication Templates) — and how each recipient fared.
import { useCallback, useEffect, useState } from 'react';
import { Mail, MessageCircle, Paperclip, Send } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import StatusBadge from '@/components/ui/StatusBadge';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import MessageComposer from '@/modules/communications/MessageComposer';
import OutboundDetailDialog from '@/modules/communications/OutboundDetailDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { formatDateTime } from '@/lib/formatDate';
import { stageLabel } from '@/schemas/communicationTemplates';
import { OUTBOUND_STATUS_LABEL as STATUS_LABEL, type OutboundChannel } from '@/schemas/outboundMessages';
import type { OutboundListItem } from '@/db/queries/outboundMessages';
import { NO_VALUE } from '@/lib/displayValue';

const CHANNEL_FILTER = [
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
];
const STATUS_FILTER = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));

export default function CommunicationsPage() {
  const [result, setResult] = useState<SaveResult | null>(null);
  const [configured, setConfigured] = useState<Record<OutboundChannel, boolean> | null>(null);

  const [rows, setRows] = useState<OutboundListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewId, setViewId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) p.set('q', search.trim());
    if (channelFilter) p.set('channel', channelFilter);
    if (statusFilter) p.set('status', statusFilter);
    const res = await safeFetchJson<OutboundListItem[]>(`/api/v1/outbound-messages?${p}`);
    if (res.ok) {
      setRows(res.data);
      setTotal(typeof res.meta?.total === 'number' ? res.meta.total : res.data.length);
      setConfigured({
        email: res.meta?.email_configured === true,
        whatsapp: res.meta?.whatsapp_configured === true,
      });
    } else {
      setRows([]);
      setTotal(0);
      setResult({ status: 'error', title: 'Could not load sent messages', message: res.message });
    }
    setLoading(false);
  }, [page, pageSize, search, channelFilter, statusFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Send className="h-5 w-5 text-primary-600" /> Email &amp; WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground">
          Write to clients, users, or any address or number — with formatting and attachments.
        </p>
      </div>

      <MessageComposer
        title="New message"
        configured={configured}
        allowConditions
        className="mb-4"
        onSent={() => {
          setPage(1);
          void load();
        }}
      />

      <DataTable<OutboundListItem>
        rows={rows}
        loading={loading}
        rowKey={(r) => r.id}
        title="Sent messages"
        searchPlaceholder="Search subject, message, recipient, sender, date..."
        emptyMessage={
          search || channelFilter || statusFilter
            ? 'No messages match these filters — clear them to see everything sent.'
            : 'Nothing has been sent from here yet — write the first message above.'
        }
        filters={
          <>
            <SearchableSelect
              size="sm"
              value={channelFilter}
              onChange={(v) => { setChannelFilter(v); setPage(1); }}
              options={CHANNEL_FILTER}
              emptyLabel="All Channels"
              placeholder="All Channels"
              aria-label="Channel"
            />
            <SearchableSelect
              size="sm"
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(1); }}
              options={STATUS_FILTER}
              emptyLabel="All Statuses"
              placeholder="All Statuses"
              aria-label="Status"
            />
          </>
        }
        columns={[
          { key: 'created_at', header: 'Sent', render: (r) => formatDateTime(r.created_at) },
          {
            key: 'channel',
            header: 'Channel',
            value: (r) => (r.channel === 'whatsapp' ? 'WhatsApp' : 'Email'),
            render: (r) => (
              <span className="inline-flex items-center gap-1.5">
                {r.channel === 'whatsapp' ? <MessageCircle className="h-4 w-4 text-emerald-500" /> : <Mail className="h-4 w-4 text-sky-500" />}
                {r.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
              </span>
            ),
          },
          {
            key: 'to_recipients',
            header: 'To',
            value: (r) => [...r.to_recipients, ...r.cc_recipients].join(', '),
            render: (r) => {
              const all = [...r.to_recipients, ...r.cc_recipients];
              return (
                <span className="block max-w-[16rem] truncate" title={all.join(', ')}>
                  {all[0] || NO_VALUE}
                  {all.length > 1 && <span className="text-muted-foreground"> +{all.length - 1}</span>}
                </span>
              );
            },
          },
          {
            key: 'subject',
            header: 'Message',
            render: (r) => (
              <span className="block min-w-0 max-w-xl">
                <span className="block truncate font-medium text-foreground" title={r.subject}>{r.subject || NO_VALUE}</span>
                <span className="block truncate text-xs text-muted-foreground" title={r.body_text}>{r.body_text}</span>
              </span>
            ),
          },
          {
            key: 'attachment_count',
            header: 'Files',
            align: 'right',
            render: (r) =>
              r.attachment_count > 0 ? (
                <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5 text-muted-foreground" />{r.attachment_count}</span>
              ) : (
                '—'
              ),
          },
          {
            key: 'status',
            header: 'Status',
            value: (r) => STATUS_LABEL[r.status] ?? r.status,
            render: (r) => <StatusBadge status={STATUS_LABEL[r.status] ?? r.status} title={r.error ?? undefined} />,
          },
          {
            key: 'entity_type',
            header: 'About',
            value: (r) => (r.entity_type ? `${stageLabel(r.entity_type)} #${r.entity_id}` : ''),
            render: (r) => (r.entity_type ? `${stageLabel(r.entity_type)} #${r.entity_id}` : NO_VALUE),
          },
          {
            key: 'sent_by_name',
            header: 'Sent by',
            value: (r) => (r.origin === 'auto' ? 'Automatic' : (r.sent_by_name ?? '')),
            render: (r) => (r.origin === 'auto' ? <span className="text-muted-foreground">Automatic</span> : (r.sent_by_name || NO_VALUE)),
          },
        ]}
        actions={(r) => ({ view: () => setViewId(r.id) })}
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

      {viewId !== null && <OutboundDetailDialog id={viewId} onClose={() => setViewId(null)} />}
      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
