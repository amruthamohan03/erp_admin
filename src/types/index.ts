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
  // Master ids since migration 0076 — main_office_master_t and
  // department_master_t. The `*_name` fields are the list join's labels.
  location_id: number | null;
  location_name?: string | null;
  dept_id: number | null;
  /** §4.7 — set means this login only sees that client's rows. */
  client_id?: number | null;
  client_name?: string;
  department_name?: string | null;
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
  | 'seal-picker'
  /** A dated remarks log — many {date, remark} entries, stored as JSONB. */
  | 'remark-log'
  | 'partielle-picker'
  | 'mca-grid'
  /**
   * A quotation's priced line items, grouped by category.
   *
   * Unlike the other repeating groups here it is NOT a JSONB column — the rows
   * live in `quotation_items_t` because they are reported on across quotations
   * (§4.5's exception). The field is virtual and the page save route's
   * quotation hook persists it.
   */
  | 'quotation-items'
  /**
   * An invoice's MCA detail rows and priced line items, edited together.
   *
   * Like `quotation-items` these are child tables rather than a JSONB column
   * (§4.5's exception), so the field is virtual and the page save route's
   * invoice hook persists it. It replaced a SECOND grid that rendered below the
   * form with its own Save — two controls writing one invoice (§4.17).
   */
  | 'invoice-grid'
  /**
   * An import invoice's files, picked in the header as main did: licences
   * (many), then the MCA references on them (many). Virtual — it reads and
   * writes `invoice_grid.mcaDetails`, so it has no column and nothing of its
   * own to save. Carries its own two labels; configure it with
   * `props.hideLabel`.
   */
  | 'invoice-files'
  /**
   * A Fiche de Calcul's lines (§2 step 3) — a JSONB column (§4.5). Its CIF and
   * DDI come from the tax_rule_master_t formulas, and the grid writes the
   * header's CIF and coefficient back through the page's change path.
   */
  | 'fiche-items';

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
  /**
   * §4.1 — where the section sits on the page, set per page in
   * `master_page_accordion_t.props`:
   *   `panel: 'side' | 'main'` — join the two-column band (narrow rail / wide panel)
   *   `dense` — draw the section as label-beside-control rows
   * Absent means what every page did before: full width, stacked.
   */
  props: Record<string, unknown> | null;
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
