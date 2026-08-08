'use client';

// §legacy — DGDA seal picker control. A read-only display of the comma-joined
// seal numbers plus a "+" button that opens a searchable checkbox modal of the
// Available seal numbers (union'd with whatever is already on the value, so a
// previously-recorded seal that is no longer "available" still shows checked).
// Shared by the transactional single-record form (FieldRenderer's seal-picker
// field type) and the exports bulk-create grid — one implementation, §4.10.
import { useState } from 'react';
import { Shield, Search, X, Check, Plus } from 'lucide-react';
import Toggle from '@/components/ui/Toggle';

interface SealPickerControlProps {
  // Comma-joined seal numbers (e.g. "AA74423, AA74424").
  value: string;
  onChange: (next: string) => void;
  readonly?: boolean;
  // `compact` renders the smaller input/button used inside table cells.
  compact?: boolean;
  id?: string;
}

export default function SealPickerControl({ value, onChange, readonly = false, compact = false, id }: SealPickerControlProps) {
  const [open, setOpen] = useState(false);
  const [avail, setAvail] = useState<Array<{ id: number; seal_number: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const current = value ?? '';

  function openModal() {
    setChecked(new Set(current.split(',').map((s) => s.trim()).filter(Boolean)));
    setSearch('');
    setOpen(true);
    setLoading(true);
    fetch('/api/v1/seal-numbers/available?limit=1000')
      .then((r) => r.json())
      .then((j) => { if (j.ok) setAvail(j.data.seals.map((s: { id: number; seal_number: string }) => ({ id: s.id, seal_number: s.seal_number }))); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  const options = (() => {
    const names = new Set(avail.map((s) => s.seal_number));
    checked.forEach((c) => names.add(c));
    const q = search.trim().toLowerCase();
    return [...names].filter((nm) => !q || nm.toLowerCase().includes(q)).sort();
  })();
  function toggle(name: string) {
    setChecked((prev) => { const x = new Set(prev); if (x.has(name)) x.delete(name); else x.add(name); return x; });
  }
  function confirm() { onChange([...checked].join(', ')); setOpen(false); }

  return (
    <>
      <div className="flex items-center gap-1">
        <input
          id={id}
          className={compact ? 'input text-xs flex-1 w-28' : 'input flex-1'}
          value={current}
          readOnly
          placeholder="No seals selected"
        />
        {!readonly && (
          <button type="button" onClick={openModal} title="Select DGDA seals"
            className={`shrink-0 inline-flex items-center justify-center rounded-md bg-emerald-600 hover:bg-emerald-700 text-white ${compact ? 'w-7 h-7' : 'w-9 h-9'}`}>
            <Plus className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </button>
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 p-4 sm:p-8 overflow-y-auto" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-md my-auto overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 text-white bg-gradient-to-r from-indigo-500 to-purple-600">
              <h2 className="font-semibold flex items-center gap-2"><Shield className="h-5 w-5" /> Select DGDA Seals</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-white/20"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input className="input pl-9" placeholder="Search seals..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="text-xs text-slate-500 mb-2">{checked.size} selected</div>
              <div className="max-h-[50vh] overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-md">
                {loading && <div className="py-6 text-center text-sm text-slate-500">Loading…</div>}
                {!loading && options.length === 0 && <div className="py-6 text-center text-sm text-slate-500">No available seals.</div>}
                {!loading && options.map((s) => (
                  <div key={s} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent">
                    <Toggle size="sm" checked={checked.has(s)} onChange={() => toggle(s)} aria-label={`Select seal ${s}`} />
                    <span className="font-mono">{s}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary"><X className="h-4 w-4" /> Cancel</button>
              <button type="button" onClick={confirm} className="btn-primary"><Check className="h-4 w-4" /> Confirm Selection</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
