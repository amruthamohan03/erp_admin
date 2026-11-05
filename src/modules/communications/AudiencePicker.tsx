'use client';

// Bulk messages by condition — the "who" half of the composer when recipients
// are chosen by what is happening to their files rather than typed one by one.
//
// The operator picks Import or Export Tracking and any mix of conditions; the
// clients owning matching files are listed with the address each message would
// go to, and every client can be switched off before sending. Within one
// condition the picks are alternatives, across conditions they all must hold.
//
// The address shown per client is computed by `contactAddresses` — the same
// function the send route runs — so what is listed is what is sent (§4.10).
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Filter, Users } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import MultiSelect from '@/components/ui/MultiSelect';
import SearchableSelect from '@/components/ui/SearchableSelect';
import Toggle from '@/components/ui/Toggle';
import { safeFetchJson } from '@/lib/safeFetch';
import { fetchMasterOptions } from '@/lib/selectOptions';
import { CLIENT_OPTION_LABEL_FIELD } from '@/lib/clientOptions';
import { summarizeZodError } from '@/lib/validation/messages';
import { NO_VALUE } from '@/lib/displayValue';
import {
  AUDIENCE_DELAY_LABEL,
  AUDIENCE_DELAYS,
  AUDIENCE_MODULE_LABEL,
  AUDIENCE_MODULES,
  CONTACT_KIND_LABEL,
  CONTACT_KINDS,
  PRE_ALERT_LABEL,
  PRE_ALERT_STATES,
  audienceSchema,
  contactAddresses,
  type AudienceInput,
  type AudienceModule,
  type ContactKind,
  type OutboundChannel,
} from '@/schemas/outboundMessages';
import type { AudienceClient } from '@/db/queries/outboundAudience';

/** What the composer needs to send: the conditions, the contacts, the clients kept. */
export interface AudienceSelection {
  audience: AudienceInput | null;
  contacts: ContactKind[];
  clientIds: number[];
}

type Option = { value: string; label: string };

const MODULE_OPTIONS: Option[] = AUDIENCE_MODULES.map((m) => ({ value: m, label: AUDIENCE_MODULE_LABEL[m] }));
const DELAY_OPTIONS: Option[] = AUDIENCE_DELAYS.map((d) => ({ value: d, label: AUDIENCE_DELAY_LABEL[d] }));
const PRE_ALERT_OPTIONS: Option[] = PRE_ALERT_STATES.map((p) => ({ value: p, label: PRE_ALERT_LABEL[p] }));
/** Long enough that ticking three statuses in a row sends one request, not three. */
const RESOLVE_DELAY_MS = 400;

const toOptions = (rows: Array<{ id: number; label: string }>): Option[] =>
  rows.map((r) => ({ value: String(r.id), label: r.label }));
const toIds = (values: string[]): number[] => values.map(Number).filter((n) => Number.isInteger(n) && n > 0);

export default function AudiencePicker({
  channel,
  onChange,
}: {
  channel: OutboundChannel;
  onChange: (selection: AudienceSelection) => void;
}) {
  const [module, setModule] = useState<AudienceModule>('import');
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [clearing, setClearing] = useState<string[]>([]);
  const [documents, setDocuments] = useState<string[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [delay, setDelay] = useState<string[]>([]);
  const [hold, setHold] = useState(false);
  const [preAlert, setPreAlert] = useState('');
  const [preAlertFrom, setPreAlertFrom] = useState('');
  const [preAlertTo, setPreAlertTo] = useState('');
  const [contacts, setContacts] = useState<ContactKind[]>(['main']);

  const [options, setOptions] = useState<{
    clients: Option[];
    clearing: Option[];
    documents: Option[];
    reasons: Option[];
    stages: Record<AudienceModule, Array<{ key: string; label: string }>>;
  }>({ clients: [], clearing: [], documents: [], reasons: [], stages: { import: [], export: [] } });

  const [matched, setMatched] = useState<AudienceClient[]>([]);
  const [fileCount, setFileCount] = useState(0);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      fetchMasterOptions('clients', CLIENT_OPTION_LABEL_FIELD),
      fetchMasterOptions('clearing-statuses', 'clearing_status'),
      fetchMasterOptions('document-statuses', 'document_status'),
      fetchMasterOptions('cancellation-reasons', 'reason_name'),
      safeFetchJson<{ stages: Record<AudienceModule, Array<{ key: string; label: string }>> }>(
        '/api/v1/outbound-messages/audience',
      ),
    ]).then(([clients, clearingRows, documentRows, reasonRows, stageRes]) => {
      setOptions({
        clients: toOptions(clients),
        clearing: toOptions(clearingRows),
        documents: toOptions(documentRows),
        reasons: toOptions(reasonRows),
        stages: stageRes.ok ? stageRes.data.stages : { import: [], export: [] },
      });
      if (!stageRes.ok) setError(stageRes.message);
    });
  }, []);

  const audience = useMemo<AudienceInput>(
    () => ({
      module,
      client_ids: toIds(clientIds),
      clearing_status_ids: toIds(clearing),
      document_status_ids: toIds(documents),
      cancellation_reason_ids: toIds(reasons),
      stages,
      delay: delay.filter((d): d is (typeof AUDIENCE_DELAYS)[number] => (AUDIENCE_DELAYS as readonly string[]).includes(d)),
      invoicing_hold: hold,
      pre_alert: module === 'import' ? PRE_ALERT_STATES.find((p) => p === preAlert) : undefined,
      pre_alert_from: module === 'import' ? preAlertFrom : '',
      pre_alert_to: module === 'import' ? preAlertTo : '',
    }),
    [module, clientIds, clearing, documents, reasons, stages, delay, hold, preAlert, preAlertFrom, preAlertTo],
  );
  const parsed = useMemo(() => audienceSchema.safeParse(audience), [audience]);

  // Re-resolve whenever the conditions change. Checked with the route's own
  // schema first, so "choose a condition" is a hint, not a failed request.
  useEffect(() => {
    if (!parsed.success) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMatched([]);
      setFileCount(0);
      setHint(summarizeZodError(parsed.error).message);
      setError(null);
      return;
    }
    setHint(null);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void safeFetchJson<AudienceClient[]>('/api/v1/outbound-messages/audience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(audience),
      }).then((res) => {
        if (cancelled) return;
        setLoading(false);
        if (res.ok) {
          setMatched(res.data);
          setFileCount(typeof res.meta?.file_count === 'number' ? res.meta.file_count : 0);
          setExcluded(new Set());
          setError(null);
        } else {
          setMatched([]);
          setFileCount(0);
          setError(res.message);
        }
      });
    }, RESOLVE_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [audience, parsed]);

  const addressesOf = useMemo(() => {
    const m = new Map<number, ReturnType<typeof contactAddresses>>();
    for (const c of matched) m.set(c.client_id, contactAddresses(c, channel, contacts));
    return m;
  }, [matched, channel, contacts]);

  const reachable = matched.filter((c) => (addressesOf.get(c.client_id)?.valid.length ?? 0) > 0);
  const chosen = reachable.filter((c) => !excluded.has(c.client_id));
  const unreachable = matched.length - reachable.length;

  useEffect(() => {
    onChange({
      audience: parsed.success ? audience : null,
      contacts,
      clientIds: chosen.map((c) => c.client_id),
    });
    // `chosen` is derived from the three below; listing it would re-fire every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, audience, contacts, matched, excluded, addressesOf]);

  const switchModule = (next: string): void => {
    if (next !== 'import' && next !== 'export') return;
    setModule(next);
    // Stage keys belong to one module, and only imports carry a pre-alert.
    setStages([]);
    setPreAlert('');
    setPreAlertFrom('');
    setPreAlertTo('');
  };

  const setIncluded = (id: number, on: boolean): void => {
    const next = new Set(excluded);
    if (on) next.delete(id);
    else next.add(id);
    setExcluded(next);
  };

  const noun = channel === 'email' ? 'email address' : 'WhatsApp number';
  const stageOptions = options.stages[module].map((s) => ({ value: s.key, label: s.label }));

  return (
    <div className="min-w-0 space-y-3">
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Filter className="h-4 w-4 text-muted-foreground" /> Conditions
          <span className="font-normal text-muted-foreground">
            — files matching any pick within a condition, and every condition chosen
          </span>
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="min-w-0">
            <label htmlFor="aud-module" className="label required">Files</label>
            <SearchableSelect id="aud-module" value={module} onChange={switchModule} options={MODULE_OPTIONS} placeholder="Choose…" aria-label="Files" />
          </div>
          <div className="min-w-0">
            <label htmlFor="aud-clearing" className="label">Clearing status</label>
            <MultiSelect id="aud-clearing" values={clearing} onChange={setClearing} options={options.clearing} placeholder="Any status" noun="statuses" aria-label="Clearing status" />
          </div>
          <div className="min-w-0">
            <label htmlFor="aud-document" className="label">Document status</label>
            <MultiSelect id="aud-document" values={documents} onChange={setDocuments} options={options.documents} placeholder="Any document status" noun="statuses" aria-label="Document status" />
          </div>
          <div className="min-w-0">
            <label htmlFor="aud-stage" className="label">Pending stage</label>
            <MultiSelect id="aud-stage" values={stages} onChange={setStages} options={stageOptions} placeholder="Any stage" noun="stages" aria-label="Pending stage" />
          </div>
          <div className="min-w-0">
            <label htmlFor="aud-reason" className="label">Cancellation reason</label>
            <MultiSelect id="aud-reason" values={reasons} onChange={setReasons} options={options.reasons} placeholder="Any reason" noun="reasons" aria-label="Cancellation reason" />
          </div>
          <div className="min-w-0">
            <label htmlFor="aud-delay" className="label">Delay</label>
            <MultiSelect id="aud-delay" values={delay} onChange={setDelay} options={DELAY_OPTIONS} placeholder="Any delay" noun="delays" aria-label="Delay" />
          </div>
          {module === 'import' && (
            <>
              <div className="min-w-0">
                <label htmlFor="aud-prealert" className="label">Pre-alert</label>
                <SearchableSelect
                  id="aud-prealert"
                  value={preAlert}
                  onChange={(v) => {
                    setPreAlert(v);
                    if (v === 'missing') {
                      setPreAlertFrom('');
                      setPreAlertTo('');
                    }
                  }}
                  options={PRE_ALERT_OPTIONS}
                  emptyLabel="Any"
                  placeholder="Any"
                  aria-label="Pre-alert"
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="aud-pa-from" className="label">Pre-alert from</label>
                <input id="aud-pa-from" type="date" className="input" value={preAlertFrom} disabled={preAlert === 'missing'} onChange={(e) => setPreAlertFrom(e.target.value)} />
              </div>
              <div className="min-w-0">
                <label htmlFor="aud-pa-to" className="label">Pre-alert to</label>
                <input id="aud-pa-to" type="date" className="input" value={preAlertTo} disabled={preAlert === 'missing'} onChange={(e) => setPreAlertTo(e.target.value)} />
              </div>
            </>
          )}
          <div className="min-w-0">
            <label htmlFor="aud-client" className="label">Only these clients</label>
            <MultiSelect id="aud-client" values={clientIds} onChange={setClientIds} options={options.clients} placeholder="Every client" noun="clients" aria-label="Only these clients" />
          </div>
          <div className="flex min-w-0 items-end pb-2">
            <Toggle checked={hold} onChange={setHold} label="Held back from invoicing" />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3">
          <span className="label mb-0 required">Send to</span>
          {CONTACT_KINDS.map((k) => (
            <Toggle
              key={k}
              size="sm"
              checked={contacts.includes(k)}
              onChange={(on) => setContacts(CONTACT_KINDS.filter((x) => (x === k ? on : contacts.includes(x))))}
              label={CONTACT_KIND_LABEL[k]}
            />
          ))}
        </div>
      </div>

      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error && (
        <p className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}
      {contacts.length === 0 && (
        <p className="text-sm text-red-700 dark:text-red-300">Send to: choose at least one contact — main, secondary or payments.</p>
      )}

      {parsed.success && (
        <DataTable<AudienceClient>
          rows={matched}
          loading={loading}
          rowKey={(c) => c.client_id}
          tableId="communications-audience"
          autoColumns={false}
          title={
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              {matched.length} client{matched.length === 1 ? '' : 's'} · {fileCount} file{fileCount === 1 ? '' : 's'} · {chosen.length} will receive it
            </span>
          }
          searchPlaceholder="Search client, file reference, address..."
          emptyMessage="No client has files meeting these conditions — loosen a condition to widen the list."
          filters={
            unreachable > 0 ? (
              <span className="text-xs text-amber-700 dark:text-amber-300">
                {unreachable} without a usable {noun} — they are skipped.
              </span>
            ) : undefined
          }
          columns={[
            {
              key: 'client_id',
              header: 'Send',
              className: 'w-14',
              value: (c) => (excluded.has(c.client_id) ? 'no' : 'yes'),
              render: (c) => {
                const usable = (addressesOf.get(c.client_id)?.valid.length ?? 0) > 0;
                return (
                  <Toggle
                    size="sm"
                    checked={usable && !excluded.has(c.client_id)}
                    disabled={!usable}
                    onChange={(on) => setIncluded(c.client_id, on)}
                    aria-label={`Send to ${c.short_name}`}
                  />
                );
              },
            },
            { key: 'short_name', header: 'Client', sortable: true, className: 'font-medium' },
            { key: 'file_count', header: 'Files', align: 'right', sortable: true },
            {
              key: 'refs',
              header: 'Recent files',
              value: (c) => c.refs.join(', '),
              render: (c) => (
                <span className="block max-w-[18rem] truncate font-mono text-xs" title={c.refs.join(', ')}>
                  {c.refs.length ? c.refs.join(', ') : NO_VALUE}
                  {c.file_count > c.refs.length && <span className="text-muted-foreground"> +{c.file_count - c.refs.length}</span>}
                </span>
              ),
            },
            {
              key: 'email',
              header: channel === 'email' ? 'Email to' : 'WhatsApp to',
              value: (c) => addressesOf.get(c.client_id)?.valid.join(', ') ?? '',
              render: (c) => {
                const a = addressesOf.get(c.client_id);
                if (a?.valid.length) {
                  return (
                    <span className="block max-w-[20rem] truncate" title={a.valid.join(', ')}>
                      {a.valid.join(', ')}
                    </span>
                  );
                }
                return (
                  <span className="block max-w-[20rem] truncate text-amber-700 dark:text-amber-300" title={a?.invalid[0]?.error}>
                    {a?.invalid[0]?.error ?? `No ${noun} on file`}
                  </span>
                );
              },
            },
          ]}
        />
      )}
    </div>
  );
}
