'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import PaginationFooter from '@/components/ui/PaginationFooter';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';

interface Row {
  id: number;
  invoice_bank_name: string;
  invoice_bank_account_name: string;
  invoice_bank_account_number: string;
  invoice_bank_swift: string | null;
  invoice_bank_address: string | null;
  display: 'Y' | 'N';
  created_at: string | null;
  updated_at: string | null;
}

export default function InvoiceBanksPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  // §4.22 — the acknowledged outcome of a create / update / delete.
  const [result, setResult] = useState<SaveResult | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/v1/invoice-banks?${params}`);
      const json = await res.json();
      if (json.ok) {
        setItems(json.data);
        setTotal(json.meta?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(id: number) {
    if (!confirm('Disable this invoice bank?')) return;
    const res = await fetch(`/api/v1/invoice-banks/${id}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (!json.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This invoice bank could not be disabled.' });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: 'The invoice bank has been disabled.' });
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Invoice Banks</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Invoice Bank
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              className="input pl-9"
              placeholder="Search bank, account, SWIFT..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-16">#</th>
                <th>Bank</th>
                <th>Account Name</th>
                <th>Account Number</th>
                <th>SWIFT</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="text-center text-muted-foreground py-8">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted-foreground py-8">
                    No invoice banks found
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="text-muted-foreground font-medium">
                      {startIndex + idx + 1}
                    </td>
                    <td className="font-medium">{r.invoice_bank_name}</td>
                    <td>{r.invoice_bank_account_name}</td>
                    <td className="font-mono text-xs">
                      {r.invoice_bank_account_number}
                    </td>
                    <td className="font-mono text-xs">
                      {r.invoice_bank_swift || '—'}
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => setEditing(r)}
                        className="ico-edit"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="ico-delete ml-1"
                        title="Disable"
                      >
                        <Trash2 className="h-4 w-4" />
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
          setPageSize={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          totalRows={total}
          totalPages={totalPages}
          startIndex={startIndex}
          mounted={mounted}
        />
      </div>

      {showCreate && (
        <FormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: 'The invoice bank has been created.' });
          }}
        />
      )}

      {editing && (
        <FormModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: 'Your changes to this invoice bank have been saved.' });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function FormModal({
  row,
  onClose,
  onSaved,
}: {
  row?: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!row;
  const [bank, setBank] = useState(row?.invoice_bank_name || '');
  const [accountName, setAccountName] = useState(
    row?.invoice_bank_account_name || '',
  );
  const [accountNumber, setAccountNumber] = useState(
    row?.invoice_bank_account_number || '',
  );
  const [swift, setSwift] = useState(row?.invoice_bank_swift || '');
  const [address, setAddress] = useState(row?.invoice_bank_address || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const checkValue = isEdit && bank === row?.invoice_bank_name ? '' : bank;
  const { status, message } = useUniqueCheck({
    resource: 'invoice-banks',
    value: checkValue,
    excludeId: row?.id ?? null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const url = isEdit
      ? `/api/v1/invoice-banks/${row!.id}`
      : '/api/v1/invoice-banks';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_bank_name: bank,
          invoice_bank_account_name: accountName,
          invoice_bank_account_number: accountNumber,
          invoice_bank_swift: swift || null,
          invoice_bank_address: address || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message || 'Save failed');
        return;
      }
      onSaved();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">
            {isEdit ? 'Edit Invoice Bank' : 'Create Invoice Bank'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (
            <div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}
          <div>
            <label className="label required">Bank Name</label>
            <input
              className="input uppercase"
              value={bank}
              onChange={(e) => setBank(e.target.value.toUpperCase())}
              required
              maxLength={255}
            />
            <div className="mt-1 text-right">
              <UniquenessIndicator status={status} message={message} />
            </div>
          </div>
          <div>
            <label className="label required">Account Name</label>
            <input
              className="input uppercase"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value.toUpperCase())}
              required
              maxLength={255}
            />
          </div>
          <div>
            <label className="label required">Account Number</label>
            <input
              className="input font-mono"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              required
              maxLength={50}
            />
          </div>
          <div>
            <label className="label">SWIFT</label>
            <input
              className="input font-mono uppercase"
              value={swift}
              onChange={(e) => setSwift(e.target.value.toUpperCase())}
              maxLength={20}
            />
          </div>
          <div>
            <label className="label">Address</label>
            <textarea
              className="input min-h-[64px]"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving || status === 'taken'} className="btn-primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
