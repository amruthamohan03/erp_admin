'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Anchor,
  ChevronDown,
  ChevronRight,
  Save,
  X,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';

// Bespoke sectioned-accordion builder for `imports_t`. 92 fields
// spread across 9 logical sections (Basic, Financial, CRF, Transport
// Docs, Customs/DGDA, Liquidation, Air Transport, Routing & Warehouse,
// Status & Remarks). Each section collapses independently so the
// operator can focus on one stage at a time.
//
// `mounted` gates pagination-style hydration aren't relevant here, but
// we still keep section open-state out of SSR to avoid mismatch with
// hash-driven default opens (deferred).
//
// All FK pickers fetch their master list once on mount via Promise.all.
// Most masters are small (<200 rows) so a single pageSize=200 fetch is
// cheap; if any grow past that, swap in server-side typeahead later.

type FormValue = string | number | boolean | null;
type Form = Record<string, FormValue>;

const EMPTY: Form = {
  // Basic
  client_id: null,
  license_id: null,
  partial_id: null,
  kind_id: null,
  type_of_goods_id: null,
  transport_mode_id: null,
  mca_ref: null,
  currency_id: null,
  license_invoice_number: null,
  supplier: null,
  regime_id: null,
  types_of_clearance_id: null,
  declaration_office_id: null,
  pre_alert_date: null,
  invoice: null,
  commodity_id: null,
  po_ref: null,
  // Financial
  fret: null,
  fret_currency_id: null,
  other_charges: null,
  other_charges_currency_id: null,
  weight: null,
  rem_weight: null,
  m3: null,
  cession_date: null,
  fob: null,
  r_fob: null,
  r_fob_currency_id: null,
  fob_currency_id: null,
  insurance_date: null,
  insurance_amount: null,
  insurance_amount_currency_id: null,
  insurance_reference: null,
  // CRF
  crf_reference: null,
  crf_received_date: null,
  clearing_based_on: null,
  ad_date: null,
  inspection_reports: null,
  archive_reference: null,
  audited_date: null,
  archived_date: null,
  // Transport Docs
  road_manif: null,
  airway_bill: null,
  container: null,
  entry_point_id: null,
  wagon: null,
  airway_bill_weight: null,
  horse: null,
  trailer_1: null,
  trailer_2: null,
  // Customs / DGDA
  dgda_in_date: null,
  declaration_reference: null,
  segues_rcv_ref: null,
  segues_payment_date: null,
  customs_manifest_number: null,
  customs_manifest_date: null,
  customs_clearance_code: null,
  dgda_out_date: null,
  document_status_id: null,
  declaration_validity: null,
  t1_number: null,
  t1_date: null,
  // Liquidation
  liquidation_reference: null,
  liquidation_date: null,
  liquidation_paid_by: null,
  liquidation_amount: null,
  quittance_reference: null,
  quittance_date: null,
  // Air
  airport_arrival_date: null,
  dispatch_from_airport: null,
  operating_company: null,
  operating_days: null,
  operating_amount: null,
  // Routing
  arrival_date_zambia: null,
  dispatch_from_zambia: null,
  drc_entry_date: null,
  border_warehouse_arrival_date: null,
  dispatch_from_border: null,
  kanyaka_arrival_date: null,
  kanyaka_dispatch_date: null,
  warehouse_arrival_date: null,
  warehouse_departure_date: null,
  dispatch_deliver_date: null,
  ibs_coupon_reference: null,
  border_warehouse_id: null,
  entry_coupon: null,
  bonded_warehouse_id: null,
  truck_status: null,
  // Status & remarks
  clearing_status_id: null,
  inv_export_disabled: false,
  inv_export_disabled_remark: null,
  remarks: null,
};

// Each section enumerates the field keys it owns. The completion
// badge counts how many of these keys have non-null/non-empty values.
const SECTIONS: { key: string; title: string; fields: (keyof typeof EMPTY)[] }[] =
  [
    {
      key: 'basic',
      title: 'Basic',
      fields: [
        'client_id',
        'license_id',
        'partial_id',
        'kind_id',
        'type_of_goods_id',
        'transport_mode_id',
        'mca_ref',
        'currency_id',
        'license_invoice_number',
        'supplier',
        'regime_id',
        'types_of_clearance_id',
        'declaration_office_id',
        'pre_alert_date',
        'invoice',
        'commodity_id',
        'po_ref',
      ],
    },
    {
      key: 'financial',
      title: 'Financial',
      fields: [
        'fret',
        'fret_currency_id',
        'other_charges',
        'other_charges_currency_id',
        'weight',
        'rem_weight',
        'm3',
        'cession_date',
        'fob',
        'r_fob',
        'r_fob_currency_id',
        'fob_currency_id',
        'insurance_date',
        'insurance_amount',
        'insurance_amount_currency_id',
        'insurance_reference',
      ],
    },
    {
      key: 'crf',
      title: 'CRF & Declaration',
      fields: [
        'crf_reference',
        'crf_received_date',
        'clearing_based_on',
        'ad_date',
        'inspection_reports',
        'archive_reference',
        'audited_date',
        'archived_date',
      ],
    },
    {
      key: 'transport',
      title: 'Transport Documents',
      fields: [
        'road_manif',
        'airway_bill',
        'container',
        'entry_point_id',
        'wagon',
        'airway_bill_weight',
        'horse',
        'trailer_1',
        'trailer_2',
      ],
    },
    {
      key: 'customs',
      title: 'Customs / DGDA',
      fields: [
        'dgda_in_date',
        'declaration_reference',
        'segues_rcv_ref',
        'segues_payment_date',
        'customs_manifest_number',
        'customs_manifest_date',
        'customs_clearance_code',
        'dgda_out_date',
        'document_status_id',
        'declaration_validity',
        't1_number',
        't1_date',
      ],
    },
    {
      key: 'liquidation',
      title: 'Liquidation & Quittance',
      fields: [
        'liquidation_reference',
        'liquidation_date',
        'liquidation_paid_by',
        'liquidation_amount',
        'quittance_reference',
        'quittance_date',
      ],
    },
    {
      key: 'air',
      title: 'Air Transport',
      fields: [
        'airport_arrival_date',
        'dispatch_from_airport',
        'operating_company',
        'operating_days',
        'operating_amount',
      ],
    },
    {
      key: 'routing',
      title: 'Routing & Warehouse',
      fields: [
        'arrival_date_zambia',
        'dispatch_from_zambia',
        'drc_entry_date',
        'border_warehouse_arrival_date',
        'dispatch_from_border',
        'kanyaka_arrival_date',
        'kanyaka_dispatch_date',
        'warehouse_arrival_date',
        'warehouse_departure_date',
        'dispatch_deliver_date',
        'ibs_coupon_reference',
        'border_warehouse_id',
        'entry_coupon',
        'bonded_warehouse_id',
        'truck_status',
      ],
    },
    {
      key: 'status',
      title: 'Status & Remarks',
      fields: [
        'clearing_status_id',
        'inv_export_disabled',
        'inv_export_disabled_remark',
        'remarks',
      ],
    },
  ];

interface MasterOption {
  value: string;
  label: string;
}

interface AllOptions {
  clients: MasterOption[];
  licenses: MasterOption[];
  partials: MasterOption[];
  kinds: MasterOption[];
  typeOfGoods: MasterOption[];
  transportModes: MasterOption[];
  currencies: MasterOption[];
  regimes: MasterOption[];
  clearances: MasterOption[];
  subOffices: MasterOption[];
  commodities: MasterOption[];
  transitPoints: MasterOption[];
  documentStatuses: MasterOption[];
  clearingStatuses: MasterOption[];
}

const EMPTY_OPTIONS: AllOptions = {
  clients: [],
  licenses: [],
  partials: [],
  kinds: [],
  typeOfGoods: [],
  transportModes: [],
  currencies: [],
  regimes: [],
  clearances: [],
  subOffices: [],
  commodities: [],
  transitPoints: [],
  documentStatuses: [],
  clearingStatuses: [],
};

async function fetchOptions<T>(
  url: string,
  toOption: (row: T) => MasterOption,
): Promise<MasterOption[]> {
  const res = await fetch(`${url}?pageSize=500`);
  const json = await res.json();
  if (!json.ok) return [];
  const data = json.data as T[];
  return data.map(toOption);
}

export default function ImportBuilder({ id }: { id?: number }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [opts, setOpts] = useState<AllOptions>(EMPTY_OPTIONS);
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(['basic']),
  );
  const [loading, setLoading] = useState<boolean>(!!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all master picker lists once. The 14 masters together
  // typically total well under 2k rows so the single round of
  // parallel fetches stays under ~200ms.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          clients,
          licenses,
          partials,
          kinds,
          typeOfGoods,
          transportModes,
          currencies,
          regimes,
          clearances,
          subOffices,
          commodities,
          transitPoints,
          documentStatuses,
          clearingStatuses,
        ] = await Promise.all([
          fetchOptions<{ id: number; name: string }>(
            '/api/v1/clients',
            (r) => ({ value: String(r.id), label: r.name }),
          ),
          fetchOptions<{ id: number; license_no?: string; licenseNo?: string }>(
            '/api/v1/licenses',
            (r) => ({
              value: String(r.id),
              label: r.license_no ?? r.licenseNo ?? `#${r.id}`,
            }),
          ),
          fetchOptions<{ id: number; partial_name: string }>(
            '/api/v1/partials',
            (r) => ({ value: String(r.id), label: r.partial_name }),
          ),
          fetchOptions<{ id: number; kind_name: string }>(
            '/api/v1/kinds',
            (r) => ({ value: String(r.id), label: r.kind_name }),
          ),
          fetchOptions<{ id: number; goods_type: string }>(
            '/api/v1/goods-types',
            (r) => ({ value: String(r.id), label: r.goods_type }),
          ),
          fetchOptions<{ id: number; transport_mode_name: string }>(
            '/api/v1/transport-modes',
            (r) => ({ value: String(r.id), label: r.transport_mode_name }),
          ),
          fetchOptions<{
            id: number;
            currency_name: string;
            currency_short_name?: string;
          }>('/api/v1/currencies', (r) => ({
            value: String(r.id),
            label: r.currency_short_name
              ? `${r.currency_short_name} — ${r.currency_name}`
              : r.currency_name,
          })),
          fetchOptions<{ id: number; regime_name: string }>(
            '/api/v1/regimes',
            (r) => ({ value: String(r.id), label: r.regime_name }),
          ),
          fetchOptions<{ id: number; clearance_name: string }>(
            '/api/v1/clearances',
            (r) => ({ value: String(r.id), label: r.clearance_name }),
          ),
          fetchOptions<{ id: number; sub_office_name: string }>(
            '/api/v1/sub-offices',
            (r) => ({ value: String(r.id), label: r.sub_office_name }),
          ),
          fetchOptions<{ id: number; commodity_name: string }>(
            '/api/v1/commodities',
            (r) => ({ value: String(r.id), label: r.commodity_name }),
          ),
          fetchOptions<{ id: number; transit_point_name: string }>(
            '/api/v1/transit-points',
            (r) => ({ value: String(r.id), label: r.transit_point_name }),
          ),
          fetchOptions<{ id: number; document_status: string }>(
            '/api/v1/document-statuses',
            (r) => ({ value: String(r.id), label: r.document_status }),
          ),
          fetchOptions<{ id: number; clearing_status: string }>(
            '/api/v1/clearing-statuses',
            (r) => ({ value: String(r.id), label: r.clearing_status }),
          ),
        ]);
        if (cancelled) return;
        setOpts({
          clients,
          licenses,
          partials,
          kinds,
          typeOfGoods,
          transportModes,
          currencies,
          regimes,
          clearances,
          subOffices,
          commodities,
          transitPoints,
          documentStatuses,
          clearingStatuses,
        });
      } catch {
        if (!cancelled) setError('Failed to load picker data');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Edit mode — fetch the row and hydrate the form.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/imports/${id}`);
        const json = await res.json();
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error?.message ?? 'Failed to load import');
          return;
        }
        // Pick only the keys we care about — the response also carries
        // joined display-name fields (client_name, etc.) that aren't
        // part of the form shape.
        const hydrated: Form = { ...EMPTY };
        for (const key of Object.keys(EMPTY) as (keyof typeof EMPTY)[]) {
          const v = json.data[key];
          if (v !== undefined) hydrated[key] = v as FormValue;
        }
        setForm(hydrated);
      } catch {
        if (!cancelled) setError('Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const toggleSection = (key: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const set = useCallback(
    (key: string) => (value: FormValue) =>
      setForm((f) => ({ ...f, [key]: value })),
    [],
  );

  // Build the request body — convert empty strings back to nulls so
  // the API doesn't store blank text.
  function toBody(): Form {
    const body: Form = {};
    for (const [k, v] of Object.entries(form)) {
      if (typeof v === 'string' && v.trim() === '') body[k] = null;
      else body[k] = v;
    }
    return body;
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const url = id ? `/api/v1/imports/${id}` : '/api/v1/imports';
      const method = id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toBody()),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message ?? 'Save failed');
        return;
      }
      const newId = id ?? json.data?.id;
      router.push(newId ? `/imports/${newId}` : '/imports');
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  const completion = useMemo(() => {
    const map: Record<string, { filled: number; total: number }> = {};
    for (const sec of SECTIONS) {
      let filled = 0;
      for (const f of sec.fields) {
        const v = form[f];
        if (v === false) filled += 1; // explicit false on boolean counts as filled
        else if (v != null && v !== '') filled += 1;
      }
      map[sec.key] = { filled, total: sec.fields.length };
    }
    return map;
  }, [form]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading import...
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Anchor className="h-6 w-6 text-primary-600" />
          {id ? `Import #${id}` : 'New Import'}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => router.push('/imports')}
          >
            <X className="h-4 w-4" /> Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {id ? 'Save changes' : 'Create import'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-3">
        {SECTIONS.map((sec) => {
          const open = openSections.has(sec.key);
          const { filled, total } = completion[sec.key];
          return (
            <div key={sec.key} className="card">
              <button
                type="button"
                onClick={() => toggleSection(sec.key)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  {open ? (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  )}
                  <span className="font-semibold text-slate-900">
                    {sec.title}
                  </span>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    filled === 0
                      ? 'bg-slate-100 text-slate-500'
                      : filled === total
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-primary-50 text-primary-700'
                  }`}
                >
                  {filled} / {total}
                </span>
              </button>
              {open && (
                <div className="border-t border-slate-200 p-4">
                  {renderSection(sec.key, form, set, opts)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Sections ───────────────────────────────────────────────────────

function renderSection(
  key: string,
  form: Form,
  set: (k: string) => (v: FormValue) => void,
  opts: AllOptions,
): React.ReactNode {
  switch (key) {
    case 'basic':
      return (
        <Grid>
          <Picker label="Client" k="client_id" form={form} set={set} options={opts.clients} />
          <Picker label="License" k="license_id" form={form} set={set} options={opts.licenses} />
          <Picker label="Partial" k="partial_id" form={form} set={set} options={opts.partials} />
          <Picker label="Kind" k="kind_id" form={form} set={set} options={opts.kinds} />
          <Picker label="Type of goods" k="type_of_goods_id" form={form} set={set} options={opts.typeOfGoods} />
          <Picker label="Transport mode" k="transport_mode_id" form={form} set={set} options={opts.transportModes} />
          <Text label="MCA ref" k="mca_ref" form={form} set={set} maxLength={100} />
          <Picker label="Currency" k="currency_id" form={form} set={set} options={opts.currencies} />
          <Text label="License invoice #" k="license_invoice_number" form={form} set={set} maxLength={100} />
          <Text label="Supplier" k="supplier" form={form} set={set} maxLength={255} />
          <Picker label="Regime" k="regime_id" form={form} set={set} options={opts.regimes} />
          <Picker label="Types of clearance" k="types_of_clearance_id" form={form} set={set} options={opts.clearances} />
          <Picker label="Declaration office" k="declaration_office_id" form={form} set={set} options={opts.subOffices} />
          <DateField label="Pre-alert date" k="pre_alert_date" form={form} set={set} />
          <Text label="Invoice" k="invoice" form={form} set={set} maxLength={100} />
          <Picker label="Commodity" k="commodity_id" form={form} set={set} options={opts.commodities} />
          <Text label="PO ref" k="po_ref" form={form} set={set} maxLength={100} />
        </Grid>
      );
    case 'financial':
      return (
        <Grid>
          <Num label="Fret" k="fret" form={form} set={set} />
          <Picker label="Fret currency" k="fret_currency_id" form={form} set={set} options={opts.currencies} />
          <Num label="Other charges" k="other_charges" form={form} set={set} />
          <Picker label="Other charges currency" k="other_charges_currency_id" form={form} set={set} options={opts.currencies} />
          <Num label="Weight" k="weight" form={form} set={set} />
          <Num label="Rem. weight" k="rem_weight" form={form} set={set} />
          <Num label="M3" k="m3" form={form} set={set} />
          <DateField label="Cession date" k="cession_date" form={form} set={set} />
          <Num label="FOB" k="fob" form={form} set={set} />
          <Num label="R FOB" k="r_fob" form={form} set={set} />
          <Picker label="R FOB currency" k="r_fob_currency_id" form={form} set={set} options={opts.currencies} />
          <Picker label="FOB currency" k="fob_currency_id" form={form} set={set} options={opts.currencies} />
          <DateField label="Insurance date" k="insurance_date" form={form} set={set} />
          <Num label="Insurance amount" k="insurance_amount" form={form} set={set} />
          <Picker label="Insurance amount currency" k="insurance_amount_currency_id" form={form} set={set} options={opts.currencies} />
          <Text label="Insurance reference" k="insurance_reference" form={form} set={set} maxLength={100} />
        </Grid>
      );
    case 'crf':
      return (
        <Grid>
          <Text label="CRF reference" k="crf_reference" form={form} set={set} maxLength={100} />
          <DateField label="CRF received date" k="crf_received_date" form={form} set={set} />
          <Text label="Clearing based on" k="clearing_based_on" form={form} set={set} maxLength={50} />
          <DateField label="AD date" k="ad_date" form={form} set={set} />
          <Text label="Inspection reports" k="inspection_reports" form={form} set={set} maxLength={100} />
          <Text label="Archive reference" k="archive_reference" form={form} set={set} maxLength={100} />
          <DateField label="Audited date" k="audited_date" form={form} set={set} />
          <DateField label="Archived date" k="archived_date" form={form} set={set} />
        </Grid>
      );
    case 'transport':
      return (
        <Grid>
          <Text label="Road manif" k="road_manif" form={form} set={set} maxLength={100} />
          <Text label="Airway bill" k="airway_bill" form={form} set={set} maxLength={100} />
          <Text label="Container" k="container" form={form} set={set} maxLength={100} />
          <Picker label="Entry point" k="entry_point_id" form={form} set={set} options={opts.transitPoints} />
          <Text label="Wagon" k="wagon" form={form} set={set} maxLength={100} />
          <Num label="Airway bill weight" k="airway_bill_weight" form={form} set={set} />
          <Text label="Horse" k="horse" form={form} set={set} maxLength={100} />
          <Text label="Trailer 1" k="trailer_1" form={form} set={set} maxLength={100} />
          <Text label="Trailer 2" k="trailer_2" form={form} set={set} maxLength={100} />
        </Grid>
      );
    case 'customs':
      return (
        <Grid>
          <DateField label="DGDA in date" k="dgda_in_date" form={form} set={set} />
          <Text label="Declaration reference" k="declaration_reference" form={form} set={set} maxLength={100} />
          <Text label="Segues rcv ref" k="segues_rcv_ref" form={form} set={set} maxLength={100} />
          <DateField label="Segues payment date" k="segues_payment_date" form={form} set={set} />
          <Text label="Customs manifest #" k="customs_manifest_number" form={form} set={set} maxLength={100} />
          <DateField label="Customs manifest date" k="customs_manifest_date" form={form} set={set} />
          <Text label="Customs clearance code" k="customs_clearance_code" form={form} set={set} maxLength={100} />
          <DateField label="DGDA out date" k="dgda_out_date" form={form} set={set} />
          <Picker label="Document status" k="document_status_id" form={form} set={set} options={opts.documentStatuses} />
          <Text label="Declaration validity" k="declaration_validity" form={form} set={set} maxLength={50} />
          <Text label="T1 number" k="t1_number" form={form} set={set} maxLength={100} />
          <DateField label="T1 date" k="t1_date" form={form} set={set} />
        </Grid>
      );
    case 'liquidation':
      return (
        <Grid>
          <Text label="Liquidation reference" k="liquidation_reference" form={form} set={set} maxLength={100} />
          <DateField label="Liquidation date" k="liquidation_date" form={form} set={set} />
          <Text label="Liquidation paid by" k="liquidation_paid_by" form={form} set={set} maxLength={100} />
          <Num label="Liquidation amount" k="liquidation_amount" form={form} set={set} />
          <Text label="Quittance reference" k="quittance_reference" form={form} set={set} maxLength={100} />
          <DateField label="Quittance date" k="quittance_date" form={form} set={set} />
        </Grid>
      );
    case 'air':
      return (
        <Grid>
          <DateField label="Airport arrival date" k="airport_arrival_date" form={form} set={set} />
          <DateField label="Dispatch from airport" k="dispatch_from_airport" form={form} set={set} />
          <Text label="Operating company" k="operating_company" form={form} set={set} maxLength={50} />
          <Num label="Operating days" k="operating_days" form={form} set={set} integer />
          <Num label="Operating amount" k="operating_amount" form={form} set={set} />
        </Grid>
      );
    case 'routing':
      return (
        <Grid>
          <DateField label="Arrival date Zambia" k="arrival_date_zambia" form={form} set={set} />
          <DateField label="Dispatch from Zambia" k="dispatch_from_zambia" form={form} set={set} />
          <DateField label="DRC entry date" k="drc_entry_date" form={form} set={set} />
          <DateField label="Border warehouse arrival" k="border_warehouse_arrival_date" form={form} set={set} />
          <DateField label="Dispatch from border" k="dispatch_from_border" form={form} set={set} />
          <DateField label="Kanyaka arrival" k="kanyaka_arrival_date" form={form} set={set} />
          <DateField label="Kanyaka dispatch" k="kanyaka_dispatch_date" form={form} set={set} />
          <DateField label="Warehouse arrival" k="warehouse_arrival_date" form={form} set={set} />
          <DateField label="Warehouse departure" k="warehouse_departure_date" form={form} set={set} />
          <DateField label="Dispatch deliver date" k="dispatch_deliver_date" form={form} set={set} />
          <Text label="IBS coupon reference" k="ibs_coupon_reference" form={form} set={set} maxLength={100} />
          <Picker label="Border warehouse" k="border_warehouse_id" form={form} set={set} options={opts.transitPoints} />
          <Text label="Entry coupon" k="entry_coupon" form={form} set={set} maxLength={100} />
          <Picker label="Bonded warehouse" k="bonded_warehouse_id" form={form} set={set} options={opts.transitPoints} />
          <Text label="Truck status" k="truck_status" form={form} set={set} maxLength={100} />
        </Grid>
      );
    case 'status':
      return (
        <Grid>
          <Picker label="Clearing status" k="clearing_status_id" form={form} set={set} options={opts.clearingStatuses} />
          <Bool label="Inv. export disabled" k="inv_export_disabled" form={form} set={set} />
          <Text
            label="Inv. export disabled remark"
            k="inv_export_disabled_remark"
            form={form}
            set={set}
            maxLength={500}
            span={2}
          />
          <Area label="Remarks" k="remarks" form={form} set={set} span={3} />
        </Grid>
      );
    default:
      return null;
  }
}

// ── Field primitives ───────────────────────────────────────────────

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {children}
    </div>
  );
}

interface FieldBaseProps {
  label: string;
  k: string;
  form: Form;
  set: (k: string) => (v: FormValue) => void;
  span?: 1 | 2 | 3;
}

function FieldShell({
  label,
  span = 1,
  children,
}: {
  label: string;
  span?: 1 | 2 | 3;
  children: React.ReactNode;
}) {
  const spanClass =
    span === 3 ? 'lg:col-span-3' : span === 2 ? 'lg:col-span-2' : '';
  return (
    <div className={spanClass}>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function Text({
  label,
  k,
  form,
  set,
  maxLength,
  span,
}: FieldBaseProps & { maxLength?: number }) {
  const v = (form[k] as string | null) ?? '';
  return (
    <FieldShell label={label} span={span}>
      <input
        type="text"
        className="input"
        value={v}
        maxLength={maxLength}
        onChange={(e) => set(k)(e.target.value || null)}
      />
    </FieldShell>
  );
}

function Num({
  label,
  k,
  form,
  set,
  integer = false,
  span,
}: FieldBaseProps & { integer?: boolean }) {
  const v = form[k];
  return (
    <FieldShell label={label} span={span}>
      <input
        type="number"
        step={integer ? '1' : 'any'}
        className="input"
        value={v == null ? '' : String(v)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            set(k)(null);
          } else if (integer) {
            const n = parseInt(raw, 10);
            set(k)(Number.isFinite(n) ? n : null);
          } else {
            // Keep as string — preserves precision through the API
            // (numeric(15,2) on the DB).
            set(k)(raw);
          }
        }}
      />
    </FieldShell>
  );
}

function DateField({ label, k, form, set, span }: FieldBaseProps) {
  const v = (form[k] as string | null) ?? '';
  return (
    <FieldShell label={label} span={span}>
      <input
        type="date"
        className="input"
        value={v}
        onChange={(e) => set(k)(e.target.value || null)}
      />
    </FieldShell>
  );
}

function Picker({
  label,
  k,
  form,
  set,
  options,
  span,
}: FieldBaseProps & { options: MasterOption[] }) {
  const v = form[k];
  return (
    <FieldShell label={label} span={span}>
      <SearchableSelect
        value={v == null ? '' : String(v)}
        onChange={(val) => set(k)(val === '' ? null : Number(val))}
        options={options}
        emptyLabel="None"
        placeholder="Select..."
      />
    </FieldShell>
  );
}

function Bool({ label, k, form, set, span }: FieldBaseProps) {
  const v = form[k] === true;
  return (
    <FieldShell label={label} span={span}>
      <label className="inline-flex items-center gap-2 mt-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300"
          checked={v}
          onChange={(e) => set(k)(e.target.checked)}
        />
        <span className="text-sm text-slate-700">{v ? 'Yes' : 'No'}</span>
      </label>
    </FieldShell>
  );
}

function Area({ label, k, form, set, span }: FieldBaseProps) {
  const v = (form[k] as string | null) ?? '';
  return (
    <FieldShell label={label} span={span}>
      <textarea
        className="input min-h-[80px]"
        rows={3}
        value={v}
        onChange={(e) => set(k)(e.target.value || null)}
      />
    </FieldShell>
  );
}
