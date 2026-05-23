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

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}
