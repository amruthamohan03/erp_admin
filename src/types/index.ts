export interface User {
  id: number;
  username: string;
  email: string;
  mobile: string | null;
  full_name: string;
  role_id: number;
  role_name?: string;
  display: 'Y' | 'N';
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
  profile_image: string | null;
  signature_image: string | null;
  location_id: string | null;
  dept_id: string | null;
}

export interface Role {
  id: number;
  role_name: string;
  parent_role_id: number | null;
  parent_role_name?: string | null;
  approval_level: number | null;
  department: number;
  management: number;
  finance: number;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface Bank {
  id: number;
  bank_name: string;
  bank_code: string;
  for_exchange: 'Y' | 'N';
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface Kind {
  id: number;
  kind_name: string;
  kind_short_name: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface Currency {
  id: number;
  currency_name: string;
  currency_short_name: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface Department {
  id: number;
  department_name: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export type DocumentStatusType = 'I' | 'E' | 'IE';

export interface DocumentStatus {
  id: number;
  document_status: string;
  type: DocumentStatusType;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface Clearance {
  id: number;
  clearance_name: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface ClearingStatus {
  id: number;
  clearing_status: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface TruckStatus {
  id: number;
  truck_status: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface Unit {
  id: number;
  unit_name: string;
  unit_code: string | null;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface Origin {
  id: number;
  origin_name: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface Industry {
  id: number;
  industry_name: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface TypeOfGoods {
  id: number;
  goods_type: string;
  goods_short_name: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface TransportMode {
  id: number;
  transport_mode_name: string;
  transport_letter: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface TransitPoint {
  id: number;
  transit_point_name: string;
  entry_point: boolean;
  exit_point: boolean;
  loading: boolean;
  destination: boolean;
  warehouse: boolean;
  location: boolean;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface Regime {
  id: number;
  regime_name: string;
  type: DocumentStatusType;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface ExpenseType {
  id: number;
  expense_type_name: string;
  is_import: boolean;
  is_export: boolean;
  is_local: boolean;
  is_advance: boolean;
  is_other: boolean;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface Commodity {
  id: number;
  commodity_name: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string | null;
  created_by: number | null;
  updated_by: number | null;
}

export interface BankExchangeRate {
  id: number;
  bank_id: number;
  bank_name?: string;
  exchange_date: string;
  currency_id: number;
  currency_code: string;
  currency_name?: string;
  bcc_rate: string | null;
  bank_rate: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface GroupCompany {
  id: number;
  group_company_name: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface DoneBy {
  id: number;
  done_by_name: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string | null;
}

export interface FeetContainer {
  id: number;
  feet_container_size: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface InvoiceBank {
  id: number;
  invoice_bank_name: string;
  invoice_bank_account_name: string;
  invoice_bank_account_number: string;
  invoice_bank_swift: string | null;
  invoice_bank_address: string | null;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface HsCode {
  id: number;
  hscode_number: string;
  hscode_ddi: string | null;
  hscode_ica: string | null;
  hscode_dci: string | null;
  hscode_dcl: string | null;
  hscode_tpi: string | null;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface Incoterm {
  id: number;
  incoterm_short_name: string;
  incoterm_full_name: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface Province {
  id: number;
  province_name: string;
  origin_id: number;
  origin_name?: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface OfficeLocation {
  id: number;
  location_name: string;
  province_id: number | null;
  province_name?: string | null;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface Phase {
  id: number;
  phase_name: string;
  phase_code: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface Referer {
  id: number;
  refferer_name: string;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface MainOffice {
  id: number;
  main_location_name: string | null;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface Client {
  id: number;
  company_name: string;
  short_name: string;
  client_type: string;
  group_company_id: number | null;
  industry_type_id: number | null;
  referred_by_id: number | null;
  office_location_id: number | null;
  address: string | null;
  phase_id: number | null;
  phase_start_date: string | null;
  phase_end_date: string | null;
  contact_person: string | null;
  email: string | null;
  email_secondary: string | null;
  phone: string | null;
  phone_secondary: string | null;
  id_nat_number: string | null;
  id_nat_file: string | null;
  rccm_number: string | null;
  rccm_file: string | null;
  import_export_number: string | null;
  import_export_validity: string | null;
  import_export_file: string | null;
  attestation_number: string | null;
  attestation_validity: string | null;
  attestation_file: string | null;
  nif_number: string | null;
  payment_contact_email: string | null;
  payment_contact_phone: string | null;
  payment_term: string | null;
  credit_term: number | null;
  liquidation_paid_by: number | null;
  license_cleared_by: number | null;
  license_submit_to_bank: number | null;
  contract_start_date: string | null;
  contract_validity: string | null;
  approval_code: string | null;
  invoice_template: string;
  verified_by_id: number | null;
  verified_by_date: string | null;
  approved_by_id: number | null;
  approved_by_date: string | null;
  remarks: string | null;
  display: 'Y' | 'N';
  created_by: number | null;
  created_at: string;
  updated_by: number | null;
  updated_at: string;
}

// License list-row shape returned by GET /api/licenses (joined display names,
// not the raw FK ids — used by the /license list table).
export interface LicenseListRow {
  id: number;
  license_number: string | null;
  client_id: number | null;
  client_name: string | null;
  bank_name: string | null;
  kind_name: string | null;
  transport_mode_id: number | null;
  transport_mode_name: string | null;
  invoice_number: string | null;
  license_applied_date: string | null;
  license_expiry_date: string | null;
  status: string;
  display: 'Y' | 'N';
}

// §4.12 transactional page model — what the runtime fetches and renders.

// Admin shapes for the master_page* CRUD UI (one type per table).
export interface MasterPage {
  id: number;
  slug: string;
  title: string;
  route: string;
  target_table: string;
  display_order: number;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
}

export interface MasterPageAccordion {
  id: number;
  page_id: number;
  slug: string;
  title: string;
  icon: string | null;
  display_order: number;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
}

export interface MasterPageField {
  id: number;
  accordion_id: number;
  name: string;
  label: string;
  field_type: string;
  required: boolean;
  options_source: string | null;
  options_label_field: string | null;
  options_static: unknown;
  props: unknown;
  display_order: number;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
}

export interface RoleGrantMatrix {
  // Roles displayed as rows.
  roles: Array<{ id: number; role_name: string }>;
  // Accordions on the page displayed as columns.
  accordions: Array<{ id: number; slug: string; title: string; display_order: number }>;
  // Sparse map: `${accordion_id}:${role_id}` → permission. Missing keys = no access.
  grants: Record<string, 'view' | 'edit'>;
}

export type AccordionPermission = 'view' | 'edit';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'tel'
  | 'number'
  | 'date'
  | 'select'
  | 'checkbox-group'
  | 'file';

export interface PageFieldDef {
  id: number;
  name: string;
  label: string;
  field_type: FieldType;
  required: boolean;
  options_source: string | null;
  options_label_field: string | null;
  options_static: Array<{ value: string; label: string }> | null;
  props: Record<string, unknown> | null;
  display_order: number;
}

export interface PageAccordionDef {
  id: number;
  slug: string;
  title: string;
  icon: string | null;
  display_order: number;
  permission: AccordionPermission;
  fields: PageFieldDef[];
}

export interface PageDef {
  id: number;
  slug: string;
  title: string;
  route: string;
  accordions: PageAccordionDef[];
}

export interface PageFetchResponse {
  page: PageDef;
  // Map of column name → current value. Empty for new entities.
  values: Record<string, unknown>;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}
