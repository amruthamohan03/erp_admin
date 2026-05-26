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

export interface MainOffice {
  id: number;
  main_location_name: string | null;
  display: 'Y' | 'N';
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}
