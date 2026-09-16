'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Landmark, Save, Search, Star } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import PaginationFooter from '@/components/ui/PaginationFooter';
import Toggle from '@/components/ui/Toggle';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import { safeFetchJson } from '@/lib/safeFetch';
import { usePagedList } from '@/lib/hooks/usePagedList';
import { fetchMasterOptions } from '@/lib/selectOptions';
import { CLIENT_OPTION_LABEL_FIELD } from '@/lib/clientOptions';

// §4.1 — Client → Invoice Bank. Which of OUR accounts a client is invoiced
// through, and which one an invoice reaches for when nobody picks.
//
// This screen is why the "Client to Bank" menu pointed at '#': the mapping was
// never ported (seedMenus said so in a note), so nothing in the schema linked a
// client to invoice_bank_master_t at all.

interface BankRow {
  invoice_bank_id: number;
  invoice_bank_name: string;
  invoice_bank_account_name: string | null;
  invoice_bank_account_number: string | null;
  invoice_bank_swift: string | null;
  is_assigned: boolean;
  is_default: boolean;
}

interface MappingResponse {
  client_id: number;
  needs_default: boolean;
  banks: BankRow[];
}

export default function ClientToBankPage() {
  const [clients, setClients] = useState<{ value: string; label: string }[]>([]);
  const [clientId, setClientId] = useState('');
  const [rows, setRows] = useState<BankRow[]>([]);
  const [search, setSearch] = useState('');
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  // §4.15 — clients are labelled by short code everywhere, including here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingClients(true);
    fetchMasterOptions('clients', CLIENT_OPTION_LABEL_FIELD)
      .then((opts) => setClients(opts.map((o) => ({ value: String(o.id), label: o.label }))))
      .finally(() => setLoadingClients(false));
  }, []);

  const loadMapping = useCallback(async (id: number) => {
    setLoadingRows(true);
    setError(null);
    const res = await safeFetchJson<MappingResponse>(
      `/api/v1/client-invoice-bank-mapping?client_id=${id}`,
    );
    setLoadingRows(false);
    if (!res.ok) {
      setError(res.message);
      setRows([]);
      return;
    }
    setRows(res.data.banks);
    setDirty(false);
  }, []);

  useEffect(() => {
    if (!clientId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows([]);
      setDirty(false);
      return;
    }
    void loadMapping(Number(clientId));
  }, [clientId, loadMapping]);

  function toggleAssigned(id: number, on: boolean): void {
    setRows((prev) =>
      prev.map((r) =>
        r.invoice_bank_id === id
          ? // Un-assigning a bank cannot leave it as the default — that pairing
            // is a contradiction the database refuses, so the UI never offers it.
            { ...r, is_assigned: on, is_default: on ? r.is_default : false }
          : r,
      ),
    );
    setDirty(true);
  }

  function makeDefault(id: number): void {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        // Exactly one, mirroring the unique index. Choosing a default also
        // assigns the bank — you cannot invoice through one you have not given
        // the client.
        is_default: r.invoice_bank_id === id,
        is_assigned: r.invoice_bank_id === id ? true : r.is_assigned,
      })),
    );
    setDirty(true);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.invoice_bank_name.toLowerCase().includes(q) ||
        (r.invoice_bank_account_name ?? '').toLowerCase().includes(q) ||
        (r.invoice_bank_account_number ?? '').toLowerCase().includes(q) ||
        (r.invoice_bank_swift ?? '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const {
    page, setPage, pageSize, setPageSize, totalRows, totalPages,
    startIndex, paged, mounted, resetPage,
  } = usePagedList(filtered);

  const assignedCount = rows.filter((r) => r.is_assigned).length;
  const defaultBank = rows.find((r) => r.is_default) ?? null;
  const clientLabel = clients.find((c) => c.value === clientId)?.label ?? 'this client';

  async function handleSave(): Promise<void> {
    if (!clientId) return;
    setSaving(true);
    setError(null);
    const res = await safeFetchJson<{ assigned: number; removed: number }>(
      '/api/v1/client-invoice-bank-mapping',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: Number(clientId),
          mappings: rows.map((r) => ({
            invoice_bank_id: r.invoice_bank_id,
            is_assigned: r.is_assigned,
            is_default: r.is_default,
          })),
        }),
      },
    );
    setSaving(false);

    if (!res.ok) {
      setResult({ status: 'error', title: 'Not saved', message: res.message });
      return;
    }
    setDirty(false);
    setResult({
      status: 'success',
      title: 'Saved',
      message:
        res.data.assigned === 0
          ? `${clientLabel} is no longer mapped to any invoice bank.`
          : `${clientLabel} is invoiced through ${res.data.assigned} bank${res.data.assigned === 1 ? '' : 's'}` +
            `${defaultBank ? `, defaulting to ${defaultBank.invoice_bank_name}` : ' — no default is set yet'}.`,
    });
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Landmark className="h-6 w-6 text-primary-600" />
            Client &rarr; Invoice Bank
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The bank accounts a client is invoiced through, and which one an invoice uses
            by default.
          </p>
        </div>
        <button
          onClick={() => void handleSave()}
          disabled={!clientId || !dirty || saving || loadingRows}
          className="btn-primary"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="card mb-6 p-4">
        <label className="label">Client</label>
        <div className="max-w-md">
          <SearchableSelect
            value={clientId}
            onChange={setClientId}
            options={clients}
            placeholder={loadingClients ? 'Loading clients…' : 'Select a client to map…'}
            emptyLabel="— Select a client —"
            aria-label="Client"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {clientId && (
        <div className="card">
          <div className="border-b border-border p-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input pl-9"
                placeholder="Search bank, account name, number, SWIFT..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  resetPage();
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {assignedCount === 0
                ? 'No bank is assigned yet — an invoice for this client has no account to print.'
                : defaultBank
                  ? `${assignedCount} assigned · invoices default to ${defaultBank.invoice_bank_name}.`
                  : `${assignedCount} assigned, but none is the default — mark one so an invoice can pick without being told.`}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-16">#</th>
                  <th className="w-[40%]">Invoice Bank</th>
                  <th>Account</th>
                  <th className="w-24 text-center">Assigned</th>
                  <th className="w-24 text-center">Default</th>
                </tr>
              </thead>
              <tbody>
                {loadingRows && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loadingRows && paged.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      {rows.length === 0
                        ? 'No invoice banks yet — create them under Masters → Invoice Banks first.'
                        : `Nothing matches “${search}”.`}
                    </td>
                  </tr>
                )}
                {!loadingRows &&
                  paged.map((r, idx) => (
                    <tr key={r.invoice_bank_id} className="hover:bg-muted/50">
                      <td className="font-medium text-muted-foreground">{startIndex + idx + 1}</td>
                      <td className="font-medium">{r.invoice_bank_name}</td>
                      <td className="text-sm text-muted-foreground">
                        <div className="max-w-0 truncate" title={r.invoice_bank_account_name ?? undefined}>
                          {r.invoice_bank_account_name || '—'}
                        </div>
                        <div className="font-mono text-xs">
                          {r.invoice_bank_account_number || '—'}
                          {r.invoice_bank_swift ? ` · ${r.invoice_bank_swift}` : ''}
                        </div>
                      </td>
                      <td className="text-center">
                        {/* §4.11 — a boolean is a Toggle, never a checkbox. */}
                        <Toggle
                          size="sm"
                          checked={r.is_assigned}
                          onChange={(on) => toggleAssigned(r.invoice_bank_id, on)}
                          aria-label={`Assign ${r.invoice_bank_name} to this client`}
                        />
                      </td>
                      <td className="text-center">
                        {/* Mutually exclusive, so a radio-style control rather
                            than a Toggle: turning one ON turns the others off,
                            which a switch would misrepresent as independent. */}
                        <button
                          type="button"
                          onClick={() => makeDefault(r.invoice_bank_id)}
                          aria-pressed={r.is_default}
                          aria-label={`Make ${r.invoice_bank_name} the default for this client`}
                          title={r.is_default ? 'Default invoice bank' : 'Make this the default'}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                            r.is_default
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                              : 'text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          <Star className={`h-4 w-4 ${r.is_default ? 'fill-current' : ''}`} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <PaginationFooter
            page={page}
            setPage={setPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            totalRows={totalRows}
            totalPages={totalPages}
            startIndex={startIndex}
            mounted={mounted}
          />
        </div>
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}
