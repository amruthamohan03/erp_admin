'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ship, Save, X, AlertTriangle, Loader2 } from 'lucide-react';
import {
  Area,
  BuilderSection,
  DateField,
  fetchMasterOptions,
  Form,
  FormValue,
  Grid,
  MasterOption,
  Num,
  Picker,
  SectionAccordion,
  Text,
  useSectionCompletion,
} from '@/components/ui/SectionedBuilder';

// Sectioned-accordion builder for `exports_t`. 73 fields across 9
// sections. Layout (sections, fields, picker types) lives here; the
// shell + field primitives + completion math come from
// SectionedBuilder.

const EMPTY: Form = {
  // Documentation
  client_id: null,
  license_id: null,
  kind_id: null,
  type_of_goods_id: null,
  transport_mode_id: null,
  mca_ref: null,
  currency_id: null,
  buyer: null,
  regime_id: null,
  types_of_clearance_id: null,
  invoice: null,
  po_ref: null,
  bp_no: null,
  hscode_id: null,
  incoterm_id: null,
  // Weight & Financial
  weight: null,
  fob: null,
  number_of_bags: null,
  lot_number: null,
  // Transport
  horse: null,
  trailer_1: null,
  trailer_2: null,
  feet_container_id: null,
  wagon_ref: null,
  container: null,
  transporter: null,
  site_of_loading_id: null,
  destination: null,
  exit_point_id: null,
  // Seals
  dgda_seal_no: null,
  number_of_seals: null,
  // Charge amounts
  ceec_amount: null,
  cgea_amount: null,
  occ_amount: null,
  lmc_amount: null,
  ogefrem_amount: null,
  // Loading / documentation dates
  loading_date: null,
  pv_date: null,
  bp_date: null,
  demande_attestation_date: null,
  assay_date: null,
  archive_reference: null,
  // Declaration
  ceec_in_date: null,
  ceec_out_date: null,
  min_div_in_date: null,
  min_div_out_date: null,
  cgea_doc_ref: null,
  segues_rcv_ref: null,
  segues_payment_date: null,
  document_status_id: null,
  customs_clearing_code: null,
  dgda_in_date: null,
  declaration_reference: null,
  liquidation_reference: null,
  liquidation_date: null,
  liquidation_paid_by: null,
  liquidation_amount: null,
  quittance_reference: null,
  quittance_date: null,
  dgda_out_date: null,
  gov_docs_in_date: null,
  gov_docs_out_date: null,
  // Logistics
  dispatch_deliver_date: null,
  kanyaka_arrival_date: null,
  kanyaka_departure_date: null,
  border_arrival_date: null,
  exit_drc_date: null,
  end_of_formalities_date: null,
  truck_status_id: null,
  lmc_id: null,
  ogefrem_inv_ref: null,
  loading_to_dispatch_date: null,
  lmc_date: null,
  ogefrem_date: null,
  audited_date: null,
  archived_date: null,
  // Status & remarks
  clearing_status_id: null,
  remarks: null,
};

const SECTIONS: BuilderSection[] = [
  {
    key: 'documentation',
    title: 'Documentation',
    fields: [
      'client_id',
      'license_id',
      'kind_id',
      'type_of_goods_id',
      'transport_mode_id',
      'mca_ref',
      'currency_id',
      'buyer',
      'regime_id',
      'types_of_clearance_id',
      'invoice',
      'po_ref',
      'bp_no',
      'hscode_id',
      'incoterm_id',
    ],
  },
  {
    key: 'financial',
    title: 'Weight & Financial',
    fields: ['weight', 'fob', 'number_of_bags', 'lot_number'],
  },
  {
    key: 'transport',
    title: 'Transport',
    fields: [
      'horse',
      'trailer_1',
      'trailer_2',
      'feet_container_id',
      'wagon_ref',
      'container',
      'transporter',
      'site_of_loading_id',
      'destination',
      'exit_point_id',
    ],
  },
  {
    key: 'seals',
    title: 'Seals',
    fields: ['dgda_seal_no', 'number_of_seals'],
  },
  {
    key: 'charges',
    title: 'Charge Amounts',
    fields: [
      'ceec_amount',
      'cgea_amount',
      'occ_amount',
      'lmc_amount',
      'ogefrem_amount',
    ],
  },
  {
    key: 'loading',
    title: 'Loading & Documentation Dates',
    fields: [
      'loading_date',
      'pv_date',
      'bp_date',
      'demande_attestation_date',
      'assay_date',
      'archive_reference',
    ],
  },
  {
    key: 'declaration',
    title: 'Declaration',
    fields: [
      'ceec_in_date',
      'ceec_out_date',
      'min_div_in_date',
      'min_div_out_date',
      'cgea_doc_ref',
      'segues_rcv_ref',
      'segues_payment_date',
      'document_status_id',
      'customs_clearing_code',
      'dgda_in_date',
      'declaration_reference',
      'liquidation_reference',
      'liquidation_date',
      'liquidation_paid_by',
      'liquidation_amount',
      'quittance_reference',
      'quittance_date',
      'dgda_out_date',
      'gov_docs_in_date',
      'gov_docs_out_date',
    ],
  },
  {
    key: 'logistics',
    title: 'Logistics',
    fields: [
      'dispatch_deliver_date',
      'kanyaka_arrival_date',
      'kanyaka_departure_date',
      'border_arrival_date',
      'exit_drc_date',
      'end_of_formalities_date',
      'truck_status_id',
      'lmc_id',
      'ogefrem_inv_ref',
      'loading_to_dispatch_date',
      'lmc_date',
      'ogefrem_date',
      'audited_date',
      'archived_date',
    ],
  },
  {
    key: 'status',
    title: 'Status & Remarks',
    fields: ['clearing_status_id', 'remarks'],
  },
];

interface AllOptions {
  clients: MasterOption[];
  licenses: MasterOption[];
  kinds: MasterOption[];
  typeOfGoods: MasterOption[];
  transportModes: MasterOption[];
  currencies: MasterOption[];
  regimes: MasterOption[];
  clearances: MasterOption[];
  feetContainers: MasterOption[];
  transitPoints: MasterOption[];
  documentStatuses: MasterOption[];
  truckStatuses: MasterOption[];
  clearingStatuses: MasterOption[];
  hscodes: MasterOption[];
  incoterms: MasterOption[];
}

const EMPTY_OPTIONS: AllOptions = {
  clients: [],
  licenses: [],
  kinds: [],
  typeOfGoods: [],
  transportModes: [],
  currencies: [],
  regimes: [],
  clearances: [],
  feetContainers: [],
  transitPoints: [],
  documentStatuses: [],
  truckStatuses: [],
  clearingStatuses: [],
  hscodes: [],
  incoterms: [],
};

export default function ExportBuilder({ id }: { id?: number }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [opts, setOpts] = useState<AllOptions>(EMPTY_OPTIONS);
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(['documentation']),
  );
  const [loading, setLoading] = useState<boolean>(!!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          clients,
          licenses,
          kinds,
          typeOfGoods,
          transportModes,
          currencies,
          regimes,
          clearances,
          feetContainers,
          transitPoints,
          documentStatuses,
          truckStatuses,
          clearingStatuses,
          hscodes,
          incoterms,
        ] = await Promise.all([
          fetchMasterOptions<{ id: number; name: string }>(
            '/api/v1/clients',
            (r) => ({ value: String(r.id), label: r.name }),
          ),
          fetchMasterOptions<{ id: number; license_no?: string }>(
            '/api/v1/licenses',
            (r) => ({
              value: String(r.id),
              label: r.license_no ?? `#${r.id}`,
            }),
          ),
          fetchMasterOptions<{ id: number; kind_name: string }>(
            '/api/v1/kinds',
            (r) => ({ value: String(r.id), label: r.kind_name }),
          ),
          fetchMasterOptions<{ id: number; goods_type: string }>(
            '/api/v1/goods-types',
            (r) => ({ value: String(r.id), label: r.goods_type }),
          ),
          fetchMasterOptions<{ id: number; transport_mode_name: string }>(
            '/api/v1/transport-modes',
            (r) => ({ value: String(r.id), label: r.transport_mode_name }),
          ),
          fetchMasterOptions<{
            id: number;
            currency_name: string;
            currency_short_name?: string;
          }>('/api/v1/currencies', (r) => ({
            value: String(r.id),
            label: r.currency_short_name
              ? `${r.currency_short_name} — ${r.currency_name}`
              : r.currency_name,
          })),
          fetchMasterOptions<{ id: number; regime_name: string }>(
            '/api/v1/regimes',
            (r) => ({ value: String(r.id), label: r.regime_name }),
          ),
          fetchMasterOptions<{ id: number; clearance_name: string }>(
            '/api/v1/clearances',
            (r) => ({ value: String(r.id), label: r.clearance_name }),
          ),
          fetchMasterOptions<{ id: number; feet_container_size: string }>(
            '/api/v1/feet-containers',
            (r) => ({ value: String(r.id), label: r.feet_container_size }),
          ),
          fetchMasterOptions<{ id: number; transit_point_name: string }>(
            '/api/v1/transit-points',
            (r) => ({ value: String(r.id), label: r.transit_point_name }),
          ),
          fetchMasterOptions<{ id: number; document_status: string }>(
            '/api/v1/document-statuses',
            (r) => ({ value: String(r.id), label: r.document_status }),
          ),
          fetchMasterOptions<{ id: number; truck_status: string }>(
            '/api/v1/truck-statuses',
            (r) => ({ value: String(r.id), label: r.truck_status }),
          ),
          fetchMasterOptions<{ id: number; clearing_status: string }>(
            '/api/v1/clearing-statuses',
            (r) => ({ value: String(r.id), label: r.clearing_status }),
          ),
          fetchMasterOptions<{ id: number; hscode_number: string }>(
            '/api/v1/hscodes',
            (r) => ({ value: String(r.id), label: r.hscode_number }),
          ),
          fetchMasterOptions<{
            id: number;
            incoterm_short_name: string;
            incoterm_full_name: string;
          }>('/api/v1/incoterms', (r) => ({
            value: String(r.id),
            label: `${r.incoterm_short_name} — ${r.incoterm_full_name}`,
          })),
        ]);
        if (cancelled) return;
        setOpts({
          clients,
          licenses,
          kinds,
          typeOfGoods,
          transportModes,
          currencies,
          regimes,
          clearances,
          feetContainers,
          transitPoints,
          documentStatuses,
          truckStatuses,
          clearingStatuses,
          hscodes,
          incoterms,
        });
      } catch {
        if (!cancelled) setError('Failed to load picker data');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/exports/${id}`);
        const json = await res.json();
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error?.message ?? 'Failed to load export');
          return;
        }
        const hydrated: Form = { ...EMPTY };
        for (const key of Object.keys(EMPTY)) {
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
      const url = id ? `/api/v1/exports/${id}` : '/api/v1/exports';
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
      router.push(newId ? `/exports/${newId}` : '/exports');
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  const completion = useSectionCompletion(form, SECTIONS);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading export...
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Ship className="h-6 w-6 text-primary-600" />
          {id ? `Export #${id}` : 'New Export'}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => router.push('/exports')}
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
            {id ? 'Save changes' : 'Create export'}
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
          const { filled, total } = completion[sec.key];
          return (
            <SectionAccordion
              key={sec.key}
              title={sec.title}
              open={openSections.has(sec.key)}
              onToggle={() => toggleSection(sec.key)}
              filled={filled}
              total={total}
            >
              {renderSection(sec.key, form, set, opts)}
            </SectionAccordion>
          );
        })}
      </div>
    </>
  );
}

function renderSection(
  key: string,
  form: Form,
  set: (k: string) => (v: FormValue) => void,
  opts: AllOptions,
): React.ReactNode {
  switch (key) {
    case 'documentation':
      return (
        <Grid>
          <Picker label="Client" k="client_id" form={form} set={set} options={opts.clients} />
          <Picker label="License" k="license_id" form={form} set={set} options={opts.licenses} />
          <Picker label="Kind" k="kind_id" form={form} set={set} options={opts.kinds} />
          <Picker label="Type of goods" k="type_of_goods_id" form={form} set={set} options={opts.typeOfGoods} />
          <Picker label="Transport mode" k="transport_mode_id" form={form} set={set} options={opts.transportModes} />
          <Text label="MCA ref" k="mca_ref" form={form} set={set} maxLength={100} />
          <Picker label="Currency" k="currency_id" form={form} set={set} options={opts.currencies} />
          <Text label="Buyer" k="buyer" form={form} set={set} maxLength={255} />
          <Picker label="Regime" k="regime_id" form={form} set={set} options={opts.regimes} />
          <Picker label="Types of clearance" k="types_of_clearance_id" form={form} set={set} options={opts.clearances} />
          <Text label="Invoice" k="invoice" form={form} set={set} maxLength={100} />
          <Text label="PO ref" k="po_ref" form={form} set={set} maxLength={100} />
          <Text label="BP no" k="bp_no" form={form} set={set} maxLength={100} />
          <Picker label="HS code" k="hscode_id" form={form} set={set} options={opts.hscodes} />
          <Picker label="Incoterm" k="incoterm_id" form={form} set={set} options={opts.incoterms} />
        </Grid>
      );
    case 'financial':
      return (
        <Grid>
          <Num label="Weight (MT)" k="weight" form={form} set={set} />
          <Num label="FOB" k="fob" form={form} set={set} />
          <Num label="Number of bags" k="number_of_bags" form={form} set={set} integer />
          <Text label="Lot number" k="lot_number" form={form} set={set} maxLength={100} />
        </Grid>
      );
    case 'transport':
      return (
        <Grid>
          <Text label="Horse" k="horse" form={form} set={set} maxLength={50} />
          <Text label="Trailer 1" k="trailer_1" form={form} set={set} maxLength={50} />
          <Text label="Trailer 2" k="trailer_2" form={form} set={set} maxLength={50} />
          <Picker label="Container size" k="feet_container_id" form={form} set={set} options={opts.feetContainers} />
          <Text label="Wagon ref" k="wagon_ref" form={form} set={set} maxLength={50} />
          <Text label="Container" k="container" form={form} set={set} maxLength={50} />
          <Text label="Transporter" k="transporter" form={form} set={set} maxLength={255} />
          <Picker label="Site of loading" k="site_of_loading_id" form={form} set={set} options={opts.transitPoints} />
          <Text label="Destination" k="destination" form={form} set={set} maxLength={255} />
          <Picker label="Exit point" k="exit_point_id" form={form} set={set} options={opts.transitPoints} />
        </Grid>
      );
    case 'seals':
      return (
        <Grid>
          <Text label="DGDA seal no" k="dgda_seal_no" form={form} set={set} maxLength={255} span={2} />
          <Num label="Number of seals" k="number_of_seals" form={form} set={set} integer />
        </Grid>
      );
    case 'charges':
      return (
        <Grid>
          <Num label="CEEC amount" k="ceec_amount" form={form} set={set} />
          <Num label="CGEA amount" k="cgea_amount" form={form} set={set} />
          <Num label="OCC amount" k="occ_amount" form={form} set={set} />
          <Num label="LMC amount" k="lmc_amount" form={form} set={set} />
          <Num label="OGEFREM amount" k="ogefrem_amount" form={form} set={set} />
        </Grid>
      );
    case 'loading':
      return (
        <Grid>
          <DateField label="Loading date" k="loading_date" form={form} set={set} />
          <DateField label="PV date" k="pv_date" form={form} set={set} />
          <DateField label="BP date" k="bp_date" form={form} set={set} />
          <DateField label="Demande attestation date" k="demande_attestation_date" form={form} set={set} />
          <DateField label="Assay date" k="assay_date" form={form} set={set} />
          <Text label="Archive reference" k="archive_reference" form={form} set={set} maxLength={255} />
        </Grid>
      );
    case 'declaration':
      return (
        <Grid>
          <DateField label="CEEC in date" k="ceec_in_date" form={form} set={set} />
          <DateField label="CEEC out date" k="ceec_out_date" form={form} set={set} />
          <DateField label="Min Div in date" k="min_div_in_date" form={form} set={set} />
          <DateField label="Min Div out date" k="min_div_out_date" form={form} set={set} />
          <Text label="CGEA doc ref" k="cgea_doc_ref" form={form} set={set} maxLength={100} />
          <Text label="Segues rcv ref" k="segues_rcv_ref" form={form} set={set} maxLength={100} />
          <DateField label="Segues payment date" k="segues_payment_date" form={form} set={set} />
          <Picker label="Document status" k="document_status_id" form={form} set={set} options={opts.documentStatuses} />
          <Text label="Customs clearing code" k="customs_clearing_code" form={form} set={set} maxLength={100} />
          <DateField label="DGDA in date" k="dgda_in_date" form={form} set={set} />
          <Text label="Declaration reference" k="declaration_reference" form={form} set={set} maxLength={100} />
          <Text label="Liquidation reference" k="liquidation_reference" form={form} set={set} maxLength={100} />
          <DateField label="Liquidation date" k="liquidation_date" form={form} set={set} />
          <Text label="Liquidation paid by" k="liquidation_paid_by" form={form} set={set} maxLength={100} />
          <Num label="Liquidation amount" k="liquidation_amount" form={form} set={set} />
          <Text label="Quittance reference" k="quittance_reference" form={form} set={set} maxLength={100} />
          <DateField label="Quittance date" k="quittance_date" form={form} set={set} />
          <DateField label="DGDA out date" k="dgda_out_date" form={form} set={set} />
          <DateField label="Gov docs in date" k="gov_docs_in_date" form={form} set={set} />
          <DateField label="Gov docs out date" k="gov_docs_out_date" form={form} set={set} />
        </Grid>
      );
    case 'logistics':
      return (
        <Grid>
          <DateField label="Dispatch deliver date" k="dispatch_deliver_date" form={form} set={set} />
          <DateField label="Kanyaka arrival" k="kanyaka_arrival_date" form={form} set={set} />
          <DateField label="Kanyaka departure" k="kanyaka_departure_date" form={form} set={set} />
          <DateField label="Border arrival" k="border_arrival_date" form={form} set={set} />
          <DateField label="Exit DRC date" k="exit_drc_date" form={form} set={set} />
          <DateField label="End of formalities" k="end_of_formalities_date" form={form} set={set} />
          <Picker label="Truck status" k="truck_status_id" form={form} set={set} options={opts.truckStatuses} />
          <Text label="LMC ID" k="lmc_id" form={form} set={set} maxLength={100} />
          <Text label="OGEFREM inv ref" k="ogefrem_inv_ref" form={form} set={set} maxLength={100} />
          <DateField label="Loading to dispatch" k="loading_to_dispatch_date" form={form} set={set} />
          <DateField label="LMC date" k="lmc_date" form={form} set={set} />
          <DateField label="OGEFREM date" k="ogefrem_date" form={form} set={set} />
          <DateField label="Audited date" k="audited_date" form={form} set={set} />
          <DateField label="Archived date" k="archived_date" form={form} set={set} />
        </Grid>
      );
    case 'status':
      return (
        <Grid>
          <Picker label="Clearing status" k="clearing_status_id" form={form} set={set} options={opts.clearingStatuses} />
          <Area label="Remarks" k="remarks" form={form} set={set} span={3} />
        </Grid>
      );
    default:
      return null;
  }
}
