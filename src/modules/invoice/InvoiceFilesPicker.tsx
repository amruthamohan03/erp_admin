'use client';

// §2 step 5 — an import invoice's files, picked in the HEADER the way main laid
// it out: Client, then "License Numbers" (many), then "MCA References" (many,
// only the files on the chosen licences). Rendered by FieldRenderer for
// `field_type: 'invoice-files'`.
//
// It holds no copy of the files: the selection IS `invoice_grid.mcaDetails`, so
// the page's one Save writes it with everything else (§4.17). The grid watches
// that list and does what picking a file implies — fill the header from the
// files, load the matching quotation — so none of that is repeated here.
//
// The licence selection is only a filter. It starts from the licences of the
// files already on the invoice, so re-opening a saved invoice shows what it was
// built from; the server derives the stored licence columns from the files.
import { useEffect, useMemo, useState } from 'react';
import MultiSelect, { type MultiSelectOption } from '@/components/ui/MultiSelect';
import { safeFetchJson } from '@/lib/safeFetch';
import { emptyMca, type InvoiceGridValue, type Pickers, type PickerMca } from '@/modules/invoice/InvoiceGrid';

/** Files with no licence recorded still need a way in — they group under this. */
const NO_LICENSE = 'none';

interface InvoiceFilesPickerProps {
  /** 0 while creating. */
  invoiceId: number;
  clientId: number | null;
  grid: InvoiceGridValue;
  onGridChange: (next: InvoiceGridValue) => void;
  readonly?: boolean;
  invalid?: boolean;
}

const licenseKey = (m: PickerMca): string => (m.license_id ? String(m.license_id) : NO_LICENSE);

export default function InvoiceFilesPicker({
  invoiceId,
  clientId,
  grid,
  onGridChange,
  readonly = false,
  invalid,
}: InvoiceFilesPickerProps): React.JSX.Element {
  const [files, setFiles] = useState<PickerMca[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [licenses, setLicenses] = useState<string[]>([]);

  const picked = useMemo(
    () => (grid.mcaDetails ?? []).map((m) => m.mca_id).filter((v): v is number => typeof v === 'number'),
    [grid.mcaDetails],
  );

  // The same list the grid's pickers read — cleared, not yet invoiced files of
  // this client, plus this invoice's own.
  useEffect(() => {
    if (!clientId) {
      setFiles([]);
      return;
    }
    let live = true;
    void (async () => {
      setLoading(true);
      const p = new URLSearchParams({ kind: 'import', client_id: String(clientId) });
      if (invoiceId > 0) p.set('invoice_id', String(invoiceId));
      const res = await safeFetchJson<Pickers>(`/api/v1/invoice-grid-pickers?${p}`);
      if (!live) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.message);
        setFiles([]);
        return;
      }
      setError(null);
      setFiles(res.data.availableMcas);
    })();
    return () => {
      live = false;
    };
  }, [clientId, invoiceId]);

  // Seed the licence filter from the files the invoice already carries, once
  // they are known — never narrow it under an operator who is choosing.
  useEffect(() => {
    if (files.length === 0 || picked.length === 0) return;
    const held = new Set(files.filter((f) => picked.includes(f.id)).map(licenseKey));
    setLicenses((prev) => {
      const merged = new Set([...prev, ...held]);
      return merged.size === prev.length ? prev : [...merged];
    });
  }, [files, picked]);

  // A new client is a new set of licences.
  useEffect(() => {
    setLicenses([]);
  }, [clientId]);

  const licenseOptions = useMemo<MultiSelectOption[]>(() => {
    const byKey = new Map<string, { label: string; count: number }>();
    for (const f of files) {
      const key = licenseKey(f);
      const entry = byKey.get(key) ?? { label: f.license_number || 'No licence recorded', count: 0 };
      entry.count += 1;
      byKey.set(key, entry);
    }
    return [...byKey.entries()].map(([value, e]) => ({
      value,
      label: e.label,
      badge: `${e.count} ${e.count === 1 ? 'file' : 'files'}`,
    }));
  }, [files]);

  const mcaOptions = useMemo<MultiSelectOption[]>(
    () =>
      files
        .filter((f) => licenses.includes(licenseKey(f)))
        .map((f) => ({ value: String(f.id), label: f.mca_ref ?? String(f.id), detail: f.detail })),
    [files, licenses],
  );

  const writeFiles = (ids: number[]): void => {
    const current = grid.mcaDetails ?? [];
    // Keep a file's row — and whatever was typed on it — when it stays picked.
    const kept = current.filter((m) => m.mca_id != null && ids.includes(m.mca_id));
    const fresh = ids.filter((id) => !kept.some((m) => m.mca_id === id));
    const next = [...kept, ...fresh.map((id, i) => emptyMca(id, kept.length + i))].map((m, i) => ({
      ...m,
      display_order: i,
    }));
    onGridChange({ ...grid, mcaDetails: next });
  };

  const onLicensesChange = (next: string[]): void => {
    setLicenses(next);
    // Dropping a licence drops its files — a file whose licence is not chosen
    // would otherwise sit on the invoice with nothing on screen to show it.
    const allowed = new Set(files.filter((f) => next.includes(licenseKey(f))).map((f) => f.id));
    const still = picked.filter((id) => allowed.has(id));
    if (still.length !== picked.length) writeFiles(still);
  };

  const disabled = readonly || !clientId;
  const hint = !clientId
    ? 'Choose a Client first.'
    : error
      ? error
      : !loading && files.length === 0
        ? 'This client has no cleared files that are not already invoiced.'
        : null;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="min-w-0">
        <label className="label required">License Numbers</label>
        <MultiSelect
          values={licenses}
          onChange={onLicensesChange}
          options={licenseOptions}
          placeholder={loading ? 'Loading…' : 'Select licences'}
          noun="Licenses"
          emptyText="No licence has a cleared file to invoice"
          disabled={disabled}
          required
          aria-label="License Numbers"
        />
        {hint && <p className={error ? 'mt-1 text-xs text-destructive' : 'mt-1 text-xs text-muted-foreground'}>{hint}</p>}
      </div>
      <div className="min-w-0">
        <label className="label required">MCA References</label>
        <MultiSelect
          values={picked.map(String)}
          onChange={(v) => writeFiles(v.map(Number))}
          options={mcaOptions}
          placeholder={licenses.length === 0 ? 'Select licences first' : 'Select MCA references'}
          noun="MCAs"
          emptyText="Choose a licence to list its files"
          disabled={disabled || licenses.length === 0}
          required
          invalid={invalid}
          aria-label="MCA References"
        />
      </div>
    </div>
  );
}
