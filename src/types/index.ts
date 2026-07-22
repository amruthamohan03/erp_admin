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

// §4.12 — transactional-page runtime types (metadata-driven forms). The
// business config lives in master_page_* tables; these types describe the shape
// the page GET returns and the components render. FieldConditions / DeriveSpec
// come from the isomorphic evaluators in src/lib/pages/.
export type { FieldConditions, Predicate } from '@/lib/pages/conditions';
import type { FieldConditions } from '@/lib/pages/conditions';
export type { DeriveSpec } from '@/lib/pages/derive';
import type { DeriveSpec } from '@/lib/pages/derive';

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
  | 'file'
  | 'seal-picker';

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
  // §4.5/§4.12 — config-driven conditional logic (visibleWhen / requiredWhen /
  // readonlyWhen / min / max). Null ⇒ the field behaves statically. Evaluated by
  // src/lib/pages/conditions.ts on both client and server.
  conditions: FieldConditions | null;
  // §4.5/§4.12 — config-driven derived value (statusMap/formula/fromRelated/
  // template). Null ⇒ a plain field. Derived fields render read-only.
  derive: DeriveSpec | null;
  display_order: number;
  // §4.14 — effective permission of this field for the current user's role
  // ('view' renders read-only, 'edit' editable). Hidden fields are never sent.
  // Absent ⇒ inherit the accordion permission (back-compat).
  permission?: 'view' | 'edit';
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
