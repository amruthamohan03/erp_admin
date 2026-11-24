'use client';

// Masters → Apurement Options: the Type and Remarque choices on Import
// Apurement's pending grid. A Type's "Requires Remarque" switch is the rule the
// grid and the save route enforce — on (legacy "Partial") the file must carry a
// Remarque, off (legacy "Total") the Remarque is cleared.
import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import Toggle from '@/components/ui/Toggle';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';
import ActiveToggleField from '@/components/ui/ActiveToggleField';
import { safeFetchJson } from '@/lib/safeFetch';
import { displayStatusColumn, setDisplay } from '@/lib/masters/displayToggle';
import { APUREMENT_OPTION_GROUP_LABELS } from '@/schemas/apurement-options';

const API = '/api/v1/apurement-options';

type Group = keyof typeof APUREMENT_OPTION_GROUP_LABELS;

interface Row {
  id: number;
  option_group: Group;
  option_name: string;
  requires_remark: boolean;
  display: 'Y' | 'N';
}

const GROUP_OPTIONS = (Object.keys(APUREMENT_OPTION_GROUP_LABELS) as Group[]).map((g) => ({
  value: g,
  label: APUREMENT_OPTION_GROUP_LABELS[g],
}));

export default function ApurementOptionsPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: search,
        include_disabled: 'true',
        page: String(page),
        pageSize: String(pageSize),
      });
      if (group) params.set('group', group);
      const res = await safeFetchJson<Row[]>(`${API}?${params}`);
      if (res.ok) {
        setItems(res.data);
        setTotal(typeof res.meta?.total === 'number' ? res.meta.total : 0);
      } else {
        setResult({ status: 'error', title: 'Not loaded', message: res.message, detail: res.detail });
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, group]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(r: Row) {
    if (!confirm(`Disable the ${APUREMENT_OPTION_GROUP_LABELS[r.option_group]} option "${r.option_name}"?`)) return;
    const res = await safeFetchJson(`${API}/${r.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setResult({ status: 'error', title: 'Not deleted', message: res.message, detail: res.detail });
      return;
    }
    setResult({ status: 'success', title: 'Deleted', message: `"${r.option_name}" has been disabled.` });
    load();
  }

  async function handleToggle(r: Row, active: boolean) {
    setResult(await setDisplay(`${API}/${r.id}`, active, r.option_name));
    load();
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Apurement Options</h1>
      </div>

      <DataTable<Row>
        exportHref={`/api/v1/masters/apurement-options/export?q=${encodeURIComponent(search)}`}
        rows={items}
        loading={loading}
        rowKey={(r) => r.id}
        searchPlaceholder="Search option name..."
        emptyMessage="No apurement options yet — create the first one."
        filters={
          <SearchableSelect
            size="sm"
            value={group}
            onChange={(v) => { setGroup(v); setPage(1); }}
            options={GROUP_OPTIONS}
            emptyLabel="Both dropdowns"
            placeholder="Both dropdowns"
            aria-label="Filter by dropdown"
          />
        }
        toolbar={
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary btn-sm">
            <Plus className="h-4 w-4" /> New Apurement Option
          </button>
        }
        columns={[
          { key: 'option_name', header: 'Option', sortable: true, className: 'font-medium' },
          {
            key: 'option_group',
            header: 'Dropdown',
            value: (r) => APUREMENT_OPTION_GROUP_LABELS[r.option_group],
            render: (r) => APUREMENT_OPTION_GROUP_LABELS[r.option_group],
          },
          {
            key: 'requires_remark',
            header: 'Requires Remarque',
            value: (r) => (r.option_group === 'type' ? (r.requires_remark ? 'Yes' : 'No') : ''),
            // A Remarque cannot demand a Remarque, so the cell says nothing there.
            render: (r) => (r.option_group === 'type' ? (r.requires_remark ? 'Yes' : 'No — clears it') : ''),
          },
          displayStatusColumn<Row>({ nameOf: (r) => r.option_name, onToggle: handleToggle }),
        ]}
        actions={(r) => ({
          edit: () => setEditing(r),
          ...(r.display === 'Y' ? { remove: () => handleDelete(r) } : {}),
        })}
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

      {showCreate && (
        <FormModal
          onClose={() => setShowCreate(false)}
          onSaved={(name) => {
            setShowCreate(false);
            load();
            setResult({ status: 'success', title: 'Created', message: `"${name}" has been added.` });
          }}
        />
      )}

      {editing && (
        <FormModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            load();
            setResult({ status: 'success', title: 'Saved', message: `Your changes to "${name}" have been saved.` });
          }}
        />
      )}

      <ResultDialog result={result} onDismiss={() => setResult(null)} />
    </>
  );
}

function FormModal({ row, onClose, onSaved }: { row?: Row; onClose: () => void; onSaved: (name: string) => void }) {
  const isEdit = !!row;
  const [group, setGroup] = useState<string>(row?.option_group ?? 'type');
  const [name, setName] = useState(row?.option_name || '');
  const [requiresRemark, setRequiresRemark] = useState(row?.requires_remark ?? false);
  const [active, setActive] = useState(row ? row.display === 'Y' : true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = isEdit
        ? { option_name: name.trim(), requires_remark: requiresRemark, display: active ? 'Y' : 'N' }
        : { option_group: group, option_name: name.trim(), requires_remark: requiresRemark, display: active ? 'Y' : 'N' };
      const res = await safeFetchJson(isEdit ? `${API}/${row!.id}` : API, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      onSaved(name.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold">{isEdit ? 'Edit Apurement Option' : 'Create Apurement Option'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3 p-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}
          <div>
            <label className="label required" htmlFor="apurement-option-group">Dropdown</label>
            {isEdit ? (
              // The group is fixed once created — files already hold this option as one or the other.
              <p id="apurement-option-group" className="text-sm text-foreground">
                {APUREMENT_OPTION_GROUP_LABELS[row!.option_group]}
              </p>
            ) : (
              <SearchableSelect
                value={group}
                onChange={setGroup}
                options={GROUP_OPTIONS}
                placeholder="Choose the dropdown"
                aria-label="Dropdown"
                required
              />
            )}
          </div>
          <div>
            <label className="label required" htmlFor="apurement-option-name">Option Name</label>
            <input
              id="apurement-option-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              autoFocus
            />
          </div>
          {group === 'type' && (
            <div>
              <Toggle
                checked={requiresRemark}
                onChange={setRequiresRemark}
                label="Requires a Remarque"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                On: a file of this type cannot be transmitted without a Remarque. Off: its Remarque is cleared.
              </p>
            </div>
          )}
          <ActiveToggleField checked={active} onChange={setActive} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
