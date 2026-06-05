'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Save, Plus, Trash2, Edit2, X, Check, Search } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import BackButton from '@/components/ui/BackButton';
import PaginationFooter from '@/components/ui/PaginationFooter';
import { usePagedList } from '@/lib/hooks/usePagedList';
import type { MasterPage, MasterPageAccordion, MasterPageField, RoleGrantMatrix } from '@/types';

type Tab = 'general' | 'accordions' | 'roles' | 'fields';

function tabFromSearch(raw: string | null): Tab {
  if (raw === 'accordions' || raw === 'roles' || raw === 'fields') return raw;
  return 'general';
}

export default function MasterPageDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const pageId = Number(idStr);
  const searchParams = useSearchParams();

  // Read initial tab from `?tab=` so sidebar deep-links land on the right tab.
  const [tab, setTab] = useState<Tab>(() => tabFromSearch(searchParams.get('tab')));
  const [page, setPage] = useState<MasterPage | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/master-pages/${pageId}`);
      const json = await res.json();
      if (json.success) setPage(json.data);
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => { reload(); }, [reload]);

  return (
    <DashboardShell>
      {/* §4.13 — Back to the pages list specifically (not browser history)
          because admins typically dive into a page from the list view. */}
      <div className="mb-4">
        <BackButton fallback="/masters/pages" />
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {loading ? 'Loading...' : page?.title || 'Page'}
        </h1>
        {page && (
          <p className="text-xs font-mono text-slate-500 mt-0.5">
            slug={page.slug} · route={page.route} · target={page.target_table}
          </p>
        )}
      </div>

      <div className="border-b border-slate-200 mb-4 flex gap-1">
        {(['general', 'accordions', 'roles', 'fields'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === t
                ? 'border-primary-600 text-primary-700 font-medium'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {t === 'general' && 'General'}
            {t === 'accordions' && 'Accordions'}
            {t === 'roles' && 'Role Grants'}
            {t === 'fields' && 'Fields'}
          </button>
        ))}
      </div>

      {!loading && page && tab === 'general'    && <GeneralTab    page={page} onSaved={reload} />}
      {!loading && page && tab === 'accordions' && <AccordionsTab pageId={pageId} />}
      {!loading && page && tab === 'roles'      && <RolesTab      pageId={pageId} />}
      {!loading && page && tab === 'fields'     && <FieldsTab     pageId={pageId} />}
    </DashboardShell>
  );
}

// ============================================================================
// General tab — edit master_page row
// ============================================================================

function GeneralTab({ page, onSaved }: { page: MasterPage; onSaved: () => void }) {
  const [form, setForm] = useState({
    slug: page.slug,
    title: page.title,
    route: page.route,
    target_table: page.target_table,
    display_order: page.display_order,
    display: page.display,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/master-pages/${page.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { setError(json.message || 'Save failed'); return; }
      onSaved();
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="card p-5 max-w-2xl space-y-3">
      {error && (<div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">{error}</div>)}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Slug *</label>
          <input className="input font-mono" value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })} required maxLength={100} />
        </div>
        <div>
          <label className="label">Title *</label>
          <input className="input" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={200} />
        </div>
        <div>
          <label className="label">Route *</label>
          <input className="input font-mono" value={form.route}
            onChange={(e) => setForm({ ...form, route: e.target.value })} required maxLength={200} />
        </div>
        <div>
          <label className="label">Target Table *</label>
          <input className="input font-mono" value={form.target_table}
            onChange={(e) => setForm({ ...form, target_table: e.target.value })} required maxLength={100} />
        </div>
        <div>
          <label className="label">Display Order</label>
          <input type="number" min="0" className="input" value={form.display_order}
            onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={form.display}
            onChange={(e) => setForm({ ...form, display: e.target.value as 'Y' | 'N' })}>
            <option value="Y">Active</option>
            <option value="N">Inactive</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-500 pt-2">
        Reminder: <code className="font-mono">target_table</code> must also appear in
        <code className="font-mono"> src/lib/pages/targets.ts</code> for the runtime to read/write it.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <button type="submit" disabled={saving} className="btn-primary">
          <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// ============================================================================
// Accordions tab — list + inline add + edit modal
// ============================================================================

function AccordionsTab({ pageId }: { pageId: number }) {
  const [items, setItems] = useState<MasterPageAccordion[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<MasterPageAccordion | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/master-page-accordions?page_id=${pageId}`);
      const json = await res.json();
      if (json.success) setItems(json.data);
    } finally { setLoading(false); }
  }, [pageId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: number) {
    if (!confirm('Disable this accordion?')) return;
    const res = await fetch(`/api/master-page-accordions/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) { alert(json.message); return; }
    load();
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between p-4 border-b border-slate-200">
        <h2 className="font-semibold">Accordions on this page</h2>
        <button onClick={() => setCreating(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Add Accordion
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-16">Order</th>
              <th>Slug</th>
              <th>Title</th>
              <th>Icon</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (<tr><td colSpan={6} className="text-center text-slate-500 py-6">Loading...</td></tr>)}
            {!loading && items.length === 0 && (<tr><td colSpan={6} className="text-center text-slate-500 py-6">No accordions yet</td></tr>)}
            {!loading && items.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="text-slate-500 font-medium">{a.display_order}</td>
                <td className="font-mono text-xs">{a.slug}</td>
                <td className="font-medium">{a.title}</td>
                <td className="text-xs">{a.icon ? <code className="font-mono">{a.icon}</code> : <span className="text-slate-400">—</span>}</td>
                <td>
                  <span className={`text-[10px] uppercase rounded px-1.5 py-0.5 ${a.display === 'Y' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {a.display === 'Y' ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="text-right">
                  <button onClick={() => setEditing(a)} className="text-slate-500 hover:text-primary-600 p-1" title="Edit">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(a.id)} className="text-slate-500 hover:text-red-600 p-1 ml-1" title="Disable">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <AccordionFormModal pageId={pageId} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />
      )}
      {editing && (
        <AccordionFormModal pageId={pageId} item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function AccordionFormModal({
  pageId, item, onClose, onSaved,
}: {
  pageId: number;
  item?: MasterPageAccordion;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    slug: item?.slug ?? '',
    title: item?.title ?? '',
    icon: item?.icon ?? '',
    display_order: item?.display_order ?? 1,
    display: item?.display ?? 'Y',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const url = isEdit ? `/api/master-page-accordions/${item!.id}` : '/api/master-page-accordions';
      const method = isEdit ? 'PUT' : 'POST';
      const body = isEdit ? form : { ...form, page_id: pageId };
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { setError(json.message || 'Save failed'); return; }
      onSaved();
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold">{isEdit ? 'Edit Accordion' : 'New Accordion'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (<div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">{error}</div>)}
          <div>
            <label className="label">Slug *</label>
            <input className="input font-mono" value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} required maxLength={100} />
          </div>
          <div>
            <label className="label">Title *</label>
            <input className="input" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={200} />
          </div>
          <div>
            <label className="label">Icon <span className="text-xs text-slate-500 ml-1">(Tabler, e.g. ti ti-users)</span></label>
            <input className="input font-mono" value={form.icon ?? ''}
              onChange={(e) => setForm({ ...form, icon: e.target.value })} maxLength={100} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Display Order</label>
              <input type="number" min="0" className="input" value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.display}
                onChange={(e) => setForm({ ...form, display: e.target.value as 'Y' | 'N' })}>
                <option value="Y">Active</option>
                <option value="N">Inactive</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Role Grants tab — matrix
// ============================================================================

function RolesTab({ pageId }: { pageId: number }) {
  const [matrix, setMatrix] = useState<RoleGrantMatrix | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/master-page-role-grants?page_id=${pageId}`);
      const json = await res.json();
      if (json.success) {
        setMatrix(json.data);
        setDirty(false);
      }
    } finally { setLoading(false); }
  }, [pageId]);

  useEffect(() => { load(); }, [load]);

  function setCell(accordionId: number, roleId: number, value: 'view' | 'edit' | 'none') {
    if (!matrix) return;
    const key = `${accordionId}:${roleId}`;
    const next = { ...matrix.grants };
    if (value === 'none') delete next[key];
    else next[key] = value;
    setMatrix({ ...matrix, grants: next });
    setDirty(true);
  }

  async function save() {
    if (!matrix) return;
    setSaving(true); setError(null);
    // Build the wire payload: include every (accordion, role) intersection so
    // missing cells become explicit deletes on the server.
    const payload: Record<string, 'view' | 'edit' | null> = {};
    for (const acc of matrix.accordions) {
      for (const role of matrix.roles) {
        const k = `${acc.id}:${role.id}`;
        payload[k] = matrix.grants[k] ?? null;
      }
    }
    try {
      const res = await fetch(`/api/master-page-role-grants?page_id=${pageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grants: payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { setError(json.message || 'Save failed'); return; }
      setDirty(false);
      setSavedAt(new Date());
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  // §4.9 — paginate/search only the DISPLAYED roles; the save payload below
  // still iterates the full matrix.roles, so off-screen grants are preserved.
  const filteredRoles = useMemo(() => {
    if (!matrix) return [];
    const q = search.trim().toLowerCase();
    return q ? matrix.roles.filter((r) => r.role_name.toLowerCase().includes(q)) : matrix.roles;
  }, [matrix, search]);
  const { page, setPage, pageSize, setPageSize, totalRows, totalPages, startIndex, paged, mounted, resetPage } =
    usePagedList(filteredRoles, { initialPageSize: 25 });

  if (loading || !matrix) return <div className="card p-6 text-center text-slate-500">Loading matrix...</div>;
  if (matrix.accordions.length === 0) return <div className="card p-6 text-center text-slate-500">Add accordions first (see the Accordions tab).</div>;
  if (matrix.roles.length === 0) return <div className="card p-6 text-center text-slate-500">No active roles found in role_master_t.</div>;

  return (
    <div className="card">
      <div className="flex items-center justify-between p-4 border-b border-slate-200">
        <div>
          <h2 className="font-semibold">Role × Accordion access</h2>
          <p className="text-xs text-slate-500 mt-0.5">For each cell, choose <code>none</code> / <code>view</code> / <code>edit</code>. Save commits the whole matrix in one transaction.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9 text-sm w-56"
              placeholder="Search role..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            />
          </div>
          {savedAt && !dirty && !saving && (<span className="text-xs text-emerald-600">Saved {savedAt.toLocaleTimeString()}</span>)}
          <button onClick={save} disabled={!dirty || saving} className="btn-primary">
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Matrix'}
          </button>
        </div>
      </div>

      {error && (<div className="rounded-md bg-red-50 p-2 mx-4 mt-3 text-sm text-red-700 border border-red-200">{error}</div>)}

      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-12">#</th>
              <th>Role</th>
              {matrix.accordions.map((a) => (
                <th key={a.id} className="text-center min-w-[110px]">{a.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((r, idx) => (
              <tr key={r.id}>
                <td className="text-slate-500 font-medium">{startIndex + idx + 1}</td>
                <td className="font-medium">{r.role_name}</td>
                {matrix.accordions.map((a) => {
                  const k = `${a.id}:${r.id}`;
                  const cur = matrix.grants[k] ?? 'none';
                  return (
                    <td key={a.id} className="text-center">
                      <select
                        value={cur}
                        onChange={(e) => setCell(a.id, r.id, e.target.value as 'view' | 'edit' | 'none')}
                        className={`text-xs rounded border px-1.5 py-0.5 ${
                          cur === 'edit' ? 'border-primary-300 bg-primary-50 text-primary-700' :
                          cur === 'view' ? 'border-slate-300 bg-slate-50 text-slate-700' :
                          'border-slate-200 text-slate-400'
                        }`}
                      >
                        <option value="none">none</option>
                        <option value="view">view</option>
                        <option value="edit">edit</option>
                      </select>
                    </td>
                  );
                })}
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
  );
}

// ============================================================================
// Fields tab — scoped by accordion (dropdown selector)
// ============================================================================

type FieldOverride = 'view' | 'edit' | 'hidden';
interface GrantRole { id: number; role_name: string }

function FieldsTab({ pageId }: { pageId: number }) {
  const [accordions, setAccordions] = useState<MasterPageAccordion[]>([]);
  const [accordionId, setAccordionId] = useState<number | null>(null);
  const [fields, setFields] = useState<MasterPageField[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<MasterPageField | null>(null);
  const [creating, setCreating] = useState(false);

  // §4.14 — field-level role grants for the selected role.
  const [roles, setRoles] = useState<GrantRole[]>([]);
  const [roleId, setRoleId] = useState<number | null>(null);
  const [overrides, setOverrides] = useState<Record<number, FieldOverride>>({});
  const [grantDirty, setGrantDirty] = useState(false);
  const [grantSaving, setGrantSaving] = useState(false);
  const [grantSavedAt, setGrantSavedAt] = useState<Date | null>(null);

  // Load accordions list once for the dropdown.
  useEffect(() => {
    fetch(`/api/master-page-accordions?page_id=${pageId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setAccordions(j.data);
          if (j.data.length > 0 && accordionId === null) setAccordionId(j.data[0].id);
        }
      });
  }, [pageId, accordionId]);

  const loadFields = useCallback(async () => {
    if (accordionId === null) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/master-page-fields?accordion_id=${accordionId}`);
      const json = await res.json();
      if (json.success) setFields(json.data);
    } finally { setLoading(false); }
  }, [accordionId]);

  useEffect(() => { loadFields(); }, [loadFields]);

  // Roles list + current overrides for the (accordion, role) pair.
  const loadGrants = useCallback(async () => {
    if (accordionId === null) return;
    const url = `/api/master-page-field-grants?accordion_id=${accordionId}${roleId ? `&role_id=${roleId}` : ''}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.success) {
      setRoles(json.data.roles);
      const ov: Record<number, FieldOverride> = {};
      for (const f of json.data.fields as Array<{ id: number; override: FieldOverride | null }>) {
        if (f.override) ov[f.id] = f.override;
      }
      setOverrides(ov);
      setGrantDirty(false);
    }
  }, [accordionId, roleId]);

  useEffect(() => { loadGrants(); }, [loadGrants]);

  function setOverride(fieldId: number, value: FieldOverride | 'inherit') {
    setOverrides((prev) => {
      const next = { ...prev };
      if (value === 'inherit') delete next[fieldId];
      else next[fieldId] = value;
      return next;
    });
    setGrantDirty(true);
  }

  async function saveGrants() {
    if (accordionId === null || roleId === null) return;
    setGrantSaving(true);
    try {
      const payload: Record<string, FieldOverride | null> = {};
      for (const f of fields) payload[String(f.id)] = overrides[f.id] ?? null;
      const res = await fetch(`/api/master-page-field-grants?accordion_id=${accordionId}&role_id=${roleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { alert(json.message || 'Save failed'); return; }
      setGrantDirty(false);
      setGrantSavedAt(new Date());
    } finally { setGrantSaving(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm('Disable this field?')) return;
    const res = await fetch(`/api/master-page-fields/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) { alert(json.message); return; }
    loadFields();
  }

  const showAccess = roleId !== null;
  const colCount = showAccess ? 8 : 7;

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Accordion:</label>
            <select
              className="input max-w-xs"
              value={accordionId ?? ''}
              onChange={(e) => setAccordionId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="" disabled>— Select —</option>
              {accordions.map((a) => (<option key={a.id} value={a.id}>{a.title}</option>))}
            </select>
          </div>
          {/* §4.14 — pick a role to manage per-field access. */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Role access:</label>
            <select
              className="input max-w-xs"
              value={roleId ?? ''}
              onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— None (manage fields) —</option>
              {roles.map((r) => (<option key={r.id} value={r.id}>{r.role_name}</option>))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {showAccess && grantSavedAt && !grantDirty && !grantSaving && (
            <span className="text-xs text-emerald-600">Saved {grantSavedAt.toLocaleTimeString()}</span>
          )}
          {showAccess ? (
            <button onClick={saveGrants} disabled={!grantDirty || grantSaving} className="btn-primary disabled:opacity-50">
              <Save className="h-4 w-4" /> {grantSaving ? 'Saving...' : 'Save Access'}
            </button>
          ) : (
            <button onClick={() => setCreating(true)} disabled={accordionId === null} className="btn-primary disabled:opacity-50">
              <Plus className="h-4 w-4" /> Add Field
            </button>
          )}
        </div>
      </div>

      {showAccess && (
        <p className="text-xs text-slate-500 px-4 pt-3">
          Per-field access for <strong>{roles.find((r) => r.id === roleId)?.role_name}</strong>.
          <code className="ml-1">Inherit</code> = use the accordion grant. Field access can only
          restrict, never exceed, the accordion grant (§4.14).
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-16">Order</th>
              <th>Name (column)</th>
              <th>Label</th>
              <th>Type</th>
              <th className="w-16">Required</th>
              <th>Options Source</th>
              {showAccess && <th className="w-40">Access</th>}
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (<tr><td colSpan={colCount} className="text-center text-slate-500 py-6">Loading...</td></tr>)}
            {!loading && fields.length === 0 && (<tr><td colSpan={colCount} className="text-center text-slate-500 py-6">No fields on this accordion yet</td></tr>)}
            {!loading && fields.map((f) => {
              const cur = overrides[f.id] ?? 'inherit';
              return (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="text-slate-500 font-medium">{f.display_order}</td>
                  <td className="font-mono text-xs">{f.name}</td>
                  <td>{f.label}</td>
                  <td><code className="font-mono text-xs">{f.field_type}</code></td>
                  <td className="text-center">{f.required ? <Check className="h-4 w-4 text-emerald-600 inline" /> : <span className="text-slate-300">—</span>}</td>
                  <td className="font-mono text-xs">{f.options_source ?? <span className="text-slate-400">—</span>}</td>
                  {showAccess && (
                    <td>
                      <select
                        value={cur}
                        onChange={(e) => setOverride(f.id, e.target.value as FieldOverride | 'inherit')}
                        className={`text-xs rounded border px-1.5 py-0.5 w-full ${
                          cur === 'edit' ? 'border-primary-300 bg-primary-50 text-primary-700' :
                          cur === 'view' ? 'border-slate-300 bg-slate-50 text-slate-700' :
                          cur === 'hidden' ? 'border-red-300 bg-red-50 text-red-700' :
                          'border-slate-200 text-slate-400'
                        }`}
                      >
                        <option value="inherit">Inherit</option>
                        <option value="view">View (read-only)</option>
                        <option value="edit">Edit</option>
                        <option value="hidden">Hidden</option>
                      </select>
                    </td>
                  )}
                  <td className="text-right">
                    <button onClick={() => setEditing(f)} className="text-slate-500 hover:text-primary-600 p-1" title="Edit">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(f.id)} className="text-slate-500 hover:text-red-600 p-1 ml-1" title="Disable">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {creating && accordionId !== null && (
        <FieldFormModal accordionId={accordionId} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); loadFields(); }} />
      )}
      {editing && (
        <FieldFormModal accordionId={editing.accordion_id} item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); loadFields(); }} />
      )}
    </div>
  );
}

const FIELD_TYPES = ['text', 'textarea', 'email', 'tel', 'number', 'date', 'select', 'checkbox-group', 'file'] as const;

function FieldFormModal({
  accordionId, item, onClose, onSaved,
}: {
  accordionId: number;
  item?: MasterPageField;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    name: item?.name ?? '',
    label: item?.label ?? '',
    field_type: item?.field_type ?? 'text',
    required: item?.required ?? false,
    options_source: item?.options_source ?? '',
    options_label_field: item?.options_label_field ?? '',
    options_static: item?.options_static ? JSON.stringify(item.options_static, null, 2) : '',
    props: item?.props ? JSON.stringify(item.props, null, 2) : '',
    display_order: item?.display_order ?? 1,
    display: item?.display ?? 'Y',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);

    // Parse the JSON-ish fields. Empty string → null. Invalid JSON → error.
    let optionsStatic: unknown = null;
    let props: unknown = null;
    try {
      if (form.options_static.trim()) optionsStatic = JSON.parse(form.options_static);
      if (form.props.trim()) props = JSON.parse(form.props);
    } catch (e) {
      setError(`JSON parse error in options_static or props: ${(e as Error).message}`);
      setSaving(false); return;
    }

    const body = {
      ...(isEdit ? {} : { accordion_id: accordionId }),
      name: form.name,
      label: form.label,
      field_type: form.field_type,
      required: form.required,
      options_source: form.options_source || null,
      options_label_field: form.options_label_field || null,
      options_static: optionsStatic,
      props,
      display_order: form.display_order,
      ...(isEdit ? { display: form.display } : {}),
    };

    try {
      const url = isEdit ? `/api/master-page-fields/${item!.id}` : '/api/master-page-fields';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { setError(json.message || 'Save failed'); return; }
      onSaved();
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h2 className="font-semibold">{isEdit ? 'Edit Field' : 'New Field'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          {error && (<div className="rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-200">{error}</div>)}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Name * <span className="text-xs text-slate-500 ml-1">(must match target column)</span></label>
              <input className="input font-mono" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} required maxLength={100} />
            </div>
            <div>
              <label className="label">Label *</label>
              <input className="input" value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })} required maxLength={255} />
            </div>
            <div>
              <label className="label">Field Type *</label>
              <select className="input" value={form.field_type}
                onChange={(e) => setForm({ ...form, field_type: e.target.value })}>
                {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Display Order</label>
              <input type="number" min="0" className="input" value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Required</label>
              <select className="input" value={form.required ? 'Y' : 'N'}
                onChange={(e) => setForm({ ...form, required: e.target.value === 'Y' })}>
                <option value="N">No</option>
                <option value="Y">Yes</option>
              </select>
            </div>
            {isEdit && (
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.display}
                  onChange={(e) => setForm({ ...form, display: e.target.value as 'Y' | 'N' })}>
                  <option value="Y">Active</option>
                  <option value="N">Inactive</option>
                </select>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500 mb-2">For <code className="font-mono">select</code> fields with dynamic options:</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Options Source <span className="text-xs text-slate-500 ml-1">(API slug, e.g. industries)</span></label>
                <input className="input font-mono" value={form.options_source}
                  onChange={(e) => setForm({ ...form, options_source: e.target.value })} maxLength={100} />
              </div>
              <div>
                <label className="label">Options Label Field</label>
                <input className="input font-mono" value={form.options_label_field}
                  onChange={(e) => setForm({ ...form, options_label_field: e.target.value })} maxLength={100} />
              </div>
            </div>
          </div>

          <div>
            <label className="label">Options Static (JSON) <span className="text-xs text-slate-500 ml-1">— for checkbox-group / static select</span></label>
            <textarea className="input font-mono text-xs min-h-[80px]" value={form.options_static}
              onChange={(e) => setForm({ ...form, options_static: e.target.value })}
              placeholder='[{"value":"I","label":"Import"}]' />
          </div>
          <div>
            <label className="label">Props (JSON) <span className="text-xs text-slate-500 ml-1">— min/max/pattern/accept/maxSizeKb/colSpan/rows</span></label>
            <textarea className="input font-mono text-xs min-h-[80px]" value={form.props}
              onChange={(e) => setForm({ ...form, props: e.target.value })}
              placeholder='{"maxLength":200,"colSpan":"5-per-row"}' />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
