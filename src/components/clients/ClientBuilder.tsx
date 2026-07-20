'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Save, X, AlertTriangle, Loader2 } from 'lucide-react';
import {
  Area,
  BuilderSection,
  DateField,
  fetchMasterOptions,
  Form,
  FormValue,
  Grid,
  MasterOption,
  Picker,
  SectionAccordion,
  Text,
  useSectionCompletion,
} from '@/components/ui/SectionedBuilder';
import UniquenessIndicator from '@/components/ui/UniquenessIndicator';
import { useUniqueCheck } from '@/lib/hooks/useUniqueCheck';

// Sectioned-accordion form for client_master_t. Same shape as
// ImportBuilder / ExportBuilder but tuned for the client onboarding
// flow — five sections (Company, Phase, Contact, Regulatory,
// Payment) with the client_code input pinned at the top since it's
// the immutable primary identifier.
//
// Regulatory `*_file` fields are plain text inputs today — the
// file-upload primitive (files_t + /api/v1/files) can wire in per-
// field as a follow-up. Keeping them text means an operator can
// paste a shared drive path in the meantime.

const EMPTY: Form = {
  // Company
  name: null,
  legal_name: null,
  client_type: null,
  group_company_id: null,
  industry_type_id: null,
  referred_by_id: null,
  office_location_id: null,
  // Phase
  phase_id: null,
  phase_start_date: null,
  phase_end_date: null,
  // Contact
  contact_person: null,
  email: null,
  email_secondary: null,
  phone: null,
  phone_secondary: null,
  address: null,
  // Regulatory
  id_nat_number: null,
  id_nat_file: null,
  rccm_number: null,
  rccm_file: null,
  import_export_number: null,
  import_export_validity: null,
  import_export_file: null,
  attestation_number: null,
  attestation_validity: null,
  attestation_file: null,
  nif_number: null,
  tax_id: null,
  // Payment
  payment_contact_email: null,
  payment_contact_phone: null,
};

const SECTIONS: BuilderSection[] = [
  {
    key: 'company',
    title: 'Company',
    fields: [
      'name',
      'legal_name',
      'client_type',
      'group_company_id',
      'industry_type_id',
      'referred_by_id',
      'office_location_id',
    ],
  },
  {
    key: 'phase',
    title: 'Onboarding Phase',
    fields: ['phase_id', 'phase_start_date', 'phase_end_date'],
  },
  {
    key: 'contact',
    title: 'Contact',
    fields: [
      'contact_person',
      'email',
      'email_secondary',
      'phone',
      'phone_secondary',
      'address',
    ],
  },
  {
    key: 'regulatory',
    title: 'Regulatory (DRC Customs)',
    fields: [
      'id_nat_number',
      'id_nat_file',
      'rccm_number',
      'rccm_file',
      'import_export_number',
      'import_export_validity',
      'import_export_file',
      'attestation_number',
      'attestation_validity',
      'attestation_file',
      'nif_number',
      'tax_id',
    ],
  },
  {
    key: 'payment',
    title: 'Payment Contact',
    fields: ['payment_contact_email', 'payment_contact_phone'],
  },
];

interface AllOptions {
  groupCompanies: MasterOption[];
  industries: MasterOption[];
  referers: MasterOption[];
  offices: MasterOption[];
  phases: MasterOption[];
}

const EMPTY_OPTIONS: AllOptions = {
  groupCompanies: [],
  industries: [],
  referers: [],
  offices: [],
  phases: [],
};

const CLIENT_TYPES: MasterOption[] = [
  { value: 'Corporate', label: 'Corporate' },
  { value: 'SME', label: 'SME' },
  { value: 'Individual', label: 'Individual' },
  { value: 'Government', label: 'Government' },
  { value: 'NGO', label: 'NGO' },
];

interface RowShape {
  id: number;
  client_code: string;
  [k: string]: unknown;
}

export default function ClientBuilder({ id }: { id?: number }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [clientCode, setClientCode] = useState('');
  const [existingCode, setExistingCode] = useState<string | null>(null);
  const [opts, setOpts] = useState<AllOptions>(EMPTY_OPTIONS);
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(['company']),
  );
  const [loading, setLoading] = useState<boolean>(!!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!id;

  // Live-check the client_code for uniqueness on create; skip on
  // edit since the field is disabled and can't collide with itself.
  const codeCheck = useUniqueCheck({
    resource: 'client-codes',
    value: isEdit ? '' : clientCode,
    excludeId: id ?? null,
  });

  // Load master picker lists once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [groupCompanies, industries, referers, offices, phases] =
          await Promise.all([
            fetchMasterOptions<{ id: number; group_company_name: string }>(
              '/api/v1/group-companies',
              (r) => ({ value: String(r.id), label: r.group_company_name }),
            ),
            fetchMasterOptions<{ id: number; industry_name: string }>(
              '/api/v1/industries',
              (r) => ({ value: String(r.id), label: r.industry_name }),
            ),
            fetchMasterOptions<{ id: number; referer_name: string }>(
              '/api/v1/referers',
              (r) => ({ value: String(r.id), label: r.referer_name }),
            ),
            fetchMasterOptions<{ id: number; location_name: string }>(
              '/api/v1/offices',
              (r) => ({ value: String(r.id), label: r.location_name }),
            ),
            fetchMasterOptions<{ id: number; phase_name: string }>(
              '/api/v1/phases',
              (r) => ({ value: String(r.id), label: r.phase_name }),
            ),
          ]);
        if (cancelled) return;
        setOpts({ groupCompanies, industries, referers, offices, phases });
      } catch {
        if (!cancelled) setError('Failed to load picker data');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Edit mode — hydrate.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/clients/${id}`);
        const json = await res.json();
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error?.message ?? 'Failed to load client');
          return;
        }
        const row = json.data as RowShape;
        setClientCode(row.client_code);
        setExistingCode(row.client_code);
        const hydrated: Form = { ...EMPTY };
        for (const key of Object.keys(EMPTY)) {
          const v = row[key];
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

  function toBody(): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form)) {
      if (typeof v === 'string' && v.trim() === '') body[k] = null;
      else body[k] = v;
    }
    return body;
  }

  async function handleSave() {
    setError(null);
    if (!isEdit && !clientCode.trim()) {
      setError('Client code is required');
      return;
    }
    if (!form.name || String(form.name).trim() === '') {
      setError('Name is required');
      return;
    }
    setSaving(true);
    try {
      const url = isEdit ? `/api/v1/clients/${id}` : '/api/v1/clients';
      const method = isEdit ? 'PUT' : 'POST';
      const payload = isEdit
        ? toBody()
        : { client_code: clientCode.trim(), ...toBody() };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message ?? 'Save failed');
        return;
      }
      const newId = id ?? json.data?.id;
      router.push(newId ? `/masters/clients/${newId}` : '/masters/clients');
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
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading client...
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Users className="h-6 w-6 text-primary-600" />
          {isEdit
            ? `Client ${existingCode ?? `#${id}`}`
            : 'New Client'}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => router.push('/masters/clients')}
          >
            <X className="h-4 w-4" /> Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={saving || (!isEdit && codeCheck.status === 'taken')}
            onClick={handleSave}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isEdit ? 'Save changes' : 'Create client'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Pinned client_code + name card — required identity fields. */}
      <div className="card p-4 mb-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Client Code *
            </label>
            <input
              type="text"
              className="input font-mono"
              value={clientCode}
              onChange={(e) => setClientCode(e.target.value)}
              maxLength={50}
              disabled={isEdit}
              placeholder="ACME001"
            />
            <div className="mt-1 text-right">
              <UniquenessIndicator
                status={codeCheck.status}
                message={codeCheck.message}
              />
            </div>
            {isEdit && (
              <p className="text-xs text-slate-500 mt-1">
                Immutable. Appears on customs paperwork.
              </p>
            )}
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Name *
            </label>
            <input
              type="text"
              className="input"
              value={(form.name as string | null) ?? ''}
              onChange={(e) => set('name')(e.target.value || null)}
              maxLength={255}
              placeholder="Acme Trading SARL"
            />
          </div>
        </div>
      </div>

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
    case 'company':
      return (
        <Grid>
          <Text label="Legal name" k="legal_name" form={form} set={set} maxLength={255} span={2} />
          <Picker label="Client type" k="client_type" form={form} set={set} options={CLIENT_TYPES} />
          <Picker label="Group company" k="group_company_id" form={form} set={set} options={opts.groupCompanies} />
          <Picker label="Industry" k="industry_type_id" form={form} set={set} options={opts.industries} />
          <Picker label="Referred by" k="referred_by_id" form={form} set={set} options={opts.referers} />
          <Picker label="Office location" k="office_location_id" form={form} set={set} options={opts.offices} span={2} />
        </Grid>
      );
    case 'phase':
      return (
        <Grid>
          <Picker label="Phase" k="phase_id" form={form} set={set} options={opts.phases} />
          <DateField label="Phase start" k="phase_start_date" form={form} set={set} />
          <DateField label="Phase end" k="phase_end_date" form={form} set={set} />
        </Grid>
      );
    case 'contact':
      return (
        <Grid>
          <Text label="Contact person" k="contact_person" form={form} set={set} maxLength={100} />
          <Text label="Email (primary)" k="email" form={form} set={set} maxLength={100} />
          <Text label="Email (secondary)" k="email_secondary" form={form} set={set} maxLength={100} />
          <Text label="Phone (primary)" k="phone" form={form} set={set} maxLength={30} />
          <Text label="Phone (secondary)" k="phone_secondary" form={form} set={set} maxLength={30} />
          <Area label="Address" k="address" form={form} set={set} span={3} />
        </Grid>
      );
    case 'regulatory':
      return (
        <Grid>
          <Text label="ID Nat number" k="id_nat_number" form={form} set={set} maxLength={50} />
          <Text label="ID Nat file" k="id_nat_file" form={form} set={set} maxLength={255} span={2} />
          <Text label="RCCM number" k="rccm_number" form={form} set={set} maxLength={50} />
          <Text label="RCCM file" k="rccm_file" form={form} set={set} maxLength={255} span={2} />
          <Text label="Import/Export number" k="import_export_number" form={form} set={set} maxLength={50} />
          <DateField label="Import/Export validity" k="import_export_validity" form={form} set={set} />
          <Text label="Import/Export file" k="import_export_file" form={form} set={set} maxLength={255} />
          <Text label="Attestation number" k="attestation_number" form={form} set={set} maxLength={50} />
          <DateField label="Attestation validity" k="attestation_validity" form={form} set={set} />
          <Text label="Attestation file" k="attestation_file" form={form} set={set} maxLength={255} />
          <Text label="NIF number" k="nif_number" form={form} set={set} maxLength={50} />
          <Text label="Tax ID" k="tax_id" form={form} set={set} maxLength={50} />
        </Grid>
      );
    case 'payment':
      return (
        <Grid>
          <Text label="Payment contact email" k="payment_contact_email" form={form} set={set} maxLength={100} />
          <Text label="Payment contact phone" k="payment_contact_phone" form={form} set={set} maxLength={30} />
        </Grid>
      );
    default:
      return null;
  }
}
