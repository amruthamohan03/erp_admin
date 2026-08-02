# Master tables

This is the registry every new master table is supposed to land in (per [CLAUDE.md](../CLAUDE.md) §9). Each row points at the Drizzle schema file and the migration that introduced the table. Naming convention: `<domain>_master_t` (see [src/modules/masters/CLAUDE.md](../src/modules/masters/CLAUDE.md) for the standard column set).

## Foundational masters

These existed before the §4 architecture work. They back the auth, navigation, and dashboard layers.

| Table | Schema file | Migration | Purpose |
| ----- | ----------- | --------- | ------- |
| `role_master_t` | [src/db/schema/roles.ts](../src/db/schema/roles.ts) | `0000_…` (initial) | Roles. Parent-role hierarchy + department/management/finance scope flags. |
| `menu_master_t` | [src/db/schema/menus.ts](../src/db/schema/menus.ts) | `0000_…` (initial) | Sidebar menus. Max 2 levels — `menu_level` + self-referencing `menu_id`. URLs double as permission resources. |
| `dashboard_card_master_t` | [src/db/schema/dashboardCards.ts](../src/db/schema/dashboardCards.ts) | [0001_add_dashboard_cards.sql](../drizzle/0001_add_dashboard_cards.sql) | Dashboard cards. Per-role visibility via `role_dashboard_card_mapping_t`. |

## Architectural masters (§4 metadata layer)

These back the rule engine, workflow engine, dynamic forms, and case-runtime. Schemas + drizzle migrations are committed; the runtime evaluators are fail-loud stubs until their `*_json` formats are picked — see CLAUDE.md §4.2 / §4.5 / §4.6 / §4.3.

| Table | Schema file | Migration | Purpose |
| ----- | ----------- | --------- | ------- |
| `rule_master_t` | [src/db/schema/rules.ts](../src/db/schema/rules.ts) | [0002_add_master_rules.sql](../drizzle/0002_add_master_rules.sql) | Business rules. `rule_json` is a [JSON Logic](https://jsonlogic.com) expression — evaluated by `applyRule` / `evaluateRule` in [src/engine/rules](../src/engine/rules/index.ts). |
| `workflow_master_t` | [src/db/schema/workflow.ts](../src/db/schema/workflow.ts) | [0003_add_master_workflow.sql](../drizzle/0003_add_master_workflow.sql) | Workflow definitions. One row per entity_type + initial state. |
| `workflow_transition_master_t` | [src/db/schema/workflow.ts](../src/db/schema/workflow.ts) | [0003_add_master_workflow.sql](../drizzle/0003_add_master_workflow.sql) | Transitions between states. Optional `rule_id` gate (JSON Logic). `action_json` is a typed array of `set_field` / `notify` actions — see [src/engine/workflow/actions.ts](../src/engine/workflow/actions.ts). |
| `form_definition_master_t` | [src/db/schema/forms.ts](../src/db/schema/forms.ts) | [0004_add_master_forms.sql](../drizzle/0004_add_master_forms.sql) | Dynamic form definitions, scoped to an entity_type. |
| `form_field_master_t` | [src/db/schema/forms.ts](../src/db/schema/forms.ts) | [0004_add_master_forms.sql](../drizzle/0004_add_master_forms.sql) | Fields of a form definition. `field_type` is a string the renderer maps to a React component. `validation_json` is a `{ required?, min?, max?, pattern?, enum? }` token bag interpreted by [src/engine/forms/validation.ts](../src/engine/forms/validation.ts). |
| `case_template_master_t` | [src/db/schema/caseTemplate.ts](../src/db/schema/caseTemplate.ts) | [0005_add_master_case_template.sql](../drizzle/0005_add_master_case_template.sql) | Ties a form + a workflow + a target table together. `createCase` / `advanceCase` in [src/modules/case-runtime](../src/modules/case-runtime/index.ts) read this and write to `target_table` via Drizzle's `sql` tag. |

## Mapping tables (not masters but referenced by them)

| Table | Schema file | Purpose |
| ----- | ----------- | ------- |
| `role_menu_mapping_t` | [src/db/schema/roleMenuMapping.ts](../src/db/schema/roleMenuMapping.ts) | Role × menu × `can_*` flags. **Also the permission backend** — `checkPermission` joins on `menu_master_t.url`. |
| `role_dashboard_card_mapping_t` | [src/db/schema/roleDashboardCardMapping.ts](../src/db/schema/roleDashboardCardMapping.ts) | Role × dashboard card × `is_visible` + `card_order`. |
| `form_field_role_t` | [src/db/schema/formFieldRoleGrants.ts](../src/db/schema/formFieldRoleGrants.ts) | Per-field, per-role permission override on `form_field_master_t`. `permission` ∈ {view, edit, hidden} (CHECK constraint). Absence of a row = default `edit`. [src/lib/formFieldGrants.ts](../src/lib/formFieldGrants.ts) exposes `fetchFieldGrants` + the pure `effectivePermission` / `canViewField` / `canEditField` / `writableFieldIds` / `visibleFieldIds` helpers; consumers strip view/hidden fields from input before Zod validation so writes can't smuggle past the grant. Adapted from main's `master_page_accordion_field_role_t` minus the accordion-clamp layer (forms here go straight from definition → fields). |

## Domain masters (§2 consignment flow)

Foundational domain tables — every consignment, license, invoice, and payment request leans on these.

| Table | Schema file | Migration | Purpose |
| ----- | ----------- | --------- | ------- |
| `client_master_t` | [src/db/schema/clients.ts](../src/db/schema/clients.ts) | [0006_add_foundational_masters.sql](../drizzle/0006_add_foundational_masters.sql) | Clients. `client_code` is the stable identifier used on customs paperwork; `legal_name` is the formal entity for invoices/tax filings. |
| `status_master_t` | [src/db/schema/status.ts](../src/db/schema/status.ts) | [0006_add_foundational_masters.sql](../drizzle/0006_add_foundational_masters.sql) | Statuses per `entity_type` (license / invoice / payment_request / …). `is_final` marks terminal states; workflow tables carry `status_key` strings rather than FKs so workflows can be configured before statuses are seeded. |
| `document_type_master_t` | [src/db/schema/documentTypes.ts](../src/db/schema/documentTypes.ts) | [0006_add_foundational_masters.sql](../drizzle/0006_add_foundational_masters.sql) | Document type catalogue (bill of lading, customs declaration, …). Concrete document rows in a future `document_t` FK back via `type_key`. |
| `license_type_master_t` | [src/db/schema/licenseTypes.ts](../src/db/schema/licenseTypes.ts) | [0006_add_foundational_masters.sql](../drizzle/0006_add_foundational_masters.sql) | License kinds (Import/`IB`, `Export`, …). Each license row picks its workflow + form via the matching `case_template_master_t` row. |
| `tax_rule_master_t` | [src/db/schema/taxRules.ts](../src/db/schema/taxRules.ts) | [0008_add_tax_rule_master.sql](../drizzle/0008_add_tax_rule_master.sql) | Tax / duty / fee formulas for Fiche de Calcul (§2 tracking phase). `formula` is JSON Logic — same evaluator as `rule_master_t`. `effective_from` / `effective_to` let rates change without deletion; `loadTaxRule` filters by `asOf` and orders by most-recent. |
| `feature_toggle_master_t` | [src/db/schema/featureToggles.ts](../src/db/schema/featureToggles.ts) | [0009_add_feature_toggle_master.sql](../drizzle/0009_add_feature_toggle_master.sql) | Global on/off switches. Callers consult `isFeatureEnabled(toggleKey, fallback?)` from [src/lib/featureToggles.ts](../src/lib/featureToggles.ts); a missing row or `display='N'` returns the fallback. Per-role / per-user scoping is deliberately deferred. |
| `field_validation_master_t` | [src/db/schema/fieldValidations.ts](../src/db/schema/fieldValidations.ts) | [0010_add_field_validation_master.sql](../drizzle/0010_add_field_validation_master.sql) | Reusable regex validations keyed by `validation_key` (e.g. `drc.phone`, `drc.tin`). `loadFieldValidation(key)` + `isValid(key, value)` in [src/lib/fieldValidations.ts](../src/lib/fieldValidations.ts) load and apply. Resolved by `loadForm` so `validation_json: { "validationKey": "drc.phone" }` inlines `pattern` + `errorMessage` before `buildFieldZodSchema` runs. |
| `approval_hierarchy_master_t` | [src/db/schema/approvalHierarchy.ts](../src/db/schema/approvalHierarchy.ts) | [0012_add_approval_hierarchy_master.sql](../drizzle/0012_add_approval_hierarchy_master.sql) | Named multi-stage approval chains for §2 step 6 (Payment Request). `stages_json` is an ordered `[{ role_id, level, label }]` array; [src/lib/approvalHierarchy.ts](../src/lib/approvalHierarchy.ts) exposes `loadApprovalHierarchy`, `parseStages`, `nextApprovalStages`, `canApproveAtLevel`, `maxApprovalLevel`. Workflow rules consult `canApproveAtLevel` as the gate. |
| `tracking_template_master_t` | [src/db/schema/trackingTemplates.ts](../src/db/schema/trackingTemplates.ts) | [0013_add_tracking_template_master.sql](../drizzle/0013_add_tracking_template_master.sql) | One row per tracking flavour (Import / Export). `milestones_json` is an ordered `[{ key, label, order }]` array; [src/lib/trackingTemplates.ts](../src/lib/trackingTemplates.ts) exposes `loadTrackingTemplate`, `parseMilestones`, `orderedMilestones`, `nextMilestone`, `trackingProgress`. FK to `license_type_master_t.id` so each license kind drives its own flow. Fiche de Calcul math lives separately in `tax_rule_master_t.formula`. |
| `report_definition_master_t` | [src/db/schema/reportDefinitions.ts](../src/db/schema/reportDefinitions.ts) | [0018_good_shape.sql](../drizzle/0018_good_shape.sql) | One row per addressable report (§2 step 7). Presentation metadata only — `columns_json` drives the result-table headers/types, optional `form_id` reuses `form_definition_master_t` for parameter inputs. The actual query lives in `src/reports/handlers/<reportKey>.ts` and is wired through `src/reports/registry.ts`; [src/lib/reports.ts](../src/lib/reports.ts) exposes `listReports`, `loadReportDefinition`, `runReport`. Hardcoded SQL in a master table would be a security risk; keeping queries in versioned code while presentation stays configurable hits the right point on the metadata-driven curve. |
| `office_master_t` | [src/db/schema/offices.ts](../src/db/schema/offices.ts) | [0021_colorful_proemial_gods.sql](../drizzle/0021_colorful_proemial_gods.sql) | Physical office locations where the company operates. Adapted from main's `main_office_master_t` (which flagged a TODO to drop the `main_` prefix per §4.1 — there's no sub-office disambiguation needed here). Used by Seals (every seal batch is purchased at one office) and any future module that needs a "where did this happen" pin. Standard `display='Y'/'N'` soft-delete with audit columns. |
| `kind_master_t` | [src/db/schema/kindMaster.ts](../src/db/schema/kindMaster.ts) | [0023_true_millenium_guard.sql](../drizzle/0023_true_millenium_guard.sql) | Quotation kind — "Import Definitive", "Import Temporary", "Export", etc. The name drives which math path runs in `compute.ts` (Export = different totals; Import Definitive flips customs lines to CDF columns). `kind_short_name` shown in compact UI. Prereq for `quotations_t`. |
| `transport_mode_master_t` | [src/db/schema/transportModeMaster.ts](../src/db/schema/transportModeMaster.ts) | [0023_true_millenium_guard.sql](../drizzle/0023_true_millenium_guard.sql) | Transport modes (sea / air / road / rail). `transport_letter` is a single-letter customs-paperwork code (S/A/R). Prereq for `quotations_t`. |
| `type_of_goods_master_t` | [src/db/schema/typeOfGoodsMaster.ts](../src/db/schema/typeOfGoodsMaster.ts) | [0023_true_millenium_guard.sql](../drizzle/0023_true_millenium_guard.sql) | Broad commodity classification ("General Merchandise", "Vehicles", "Hazardous"). Distinct from HS code — operator-facing bucket for filtering + reporting. Prereq for `quotations_t`. |
| `unit_master_t` | [src/db/schema/unitMaster.ts](../src/db/schema/unitMaster.ts) | [0023_true_millenium_guard.sql](../drizzle/0023_true_millenium_guard.sql) | Unit of measure — kg, m³, box, container, etc. `unit_code` is a short symbol for compact cells. Prereq for `quotation_items_t`. |
| `currency_master_t` | [src/db/schema/currencyMaster.ts](../src/db/schema/currencyMaster.ts) | [0023_true_millenium_guard.sql](../drizzle/0023_true_millenium_guard.sql) | Currencies the quotation system can express line items in (USD, EUR, CDF, …). Distinct from the `iso.currency_code` validation in `field_validation_master_t` — that one's a regex check; this is the FK chain `quotation_items_t.currency_id` needs. Seed with the same set the validation accepts so the two stay consistent until a future slice unifies them. |
| `quotation_category_master_t` | [src/db/schema/quotationCategoryMaster.ts](../src/db/schema/quotationCategoryMaster.ts) | [0023_true_millenium_guard.sql](../drizzle/0023_true_millenium_guard.sql) | Line-item categories on a quotation. `category_header` is the bilingual section heading shown on the quotation page, `display_order` orders sections, `is_customs` is the load-bearing config flag that switches the customs category to CDF in Import-Definitive mode. Never name-matched in code — `is_customs=true` is the only signal, so renaming the category doesn't break the math. |
| `item_master_t` | [src/db/schema/itemMaster.ts](../src/db/schema/itemMaster.ts) | [0023_true_millenium_guard.sql](../drizzle/0023_true_millenium_guard.sql) | The catalogue of charges that appear on quotations + Fiche de Calcul (clearance fees, freight, handling, etc.). `tax_not_tax` is a single-letter tax-class code (A–P subset, A = standard taxable). `item_type` is the trade direction: 'I' (Import), 'E' (Export), 'U' (Universal), or combinations. `category_id` FK → `quotation_category_master_t` ties the item to a category — the math path depends on `category.is_customs`. |
| `partial_master_t` | [src/db/schema/partialMaster.ts](../src/db/schema/partialMaster.ts) | [0025_great_valkyrie.sql](../drizzle/0025_great_valkyrie.sql) | Partial-shipment classification. Imports / exports reference this when a consignment is split across multiple movements (partial-1, partial-2, …). Renamed from main's `partial_t` to match the `_master_t` convention. |
| `regime_master_t` | [src/db/schema/regimeMaster.ts](../src/db/schema/regimeMaster.ts) | [0025_great_valkyrie.sql](../drizzle/0025_great_valkyrie.sql) | Customs regime ("Import Definitive", "Temporary Admission", "Transit"). `type` is a 2-char code pairing with the human name on customs declarations. |
| `clearance_master_t` | [src/db/schema/clearanceMaster.ts](../src/db/schema/clearanceMaster.ts) | [0025_great_valkyrie.sql](../drizzle/0025_great_valkyrie.sql) | Type of customs clearance ("Definitive", "Provisional", "Transit clearance"). `imports_t.types_of_clearance` FKs here. |
| `sub_office_master_t` | [src/db/schema/subOfficeMaster.ts](../src/db/schema/subOfficeMaster.ts) | [0025_great_valkyrie.sql](../drizzle/0025_great_valkyrie.sql) | Customs declaration office under the main `office_master_t`. `imports_t.declaration_office_id` FKs here — the actual office where a customs declaration is filed. |
| `commodity_master_t` | [src/db/schema/commodityMaster.ts](../src/db/schema/commodityMaster.ts) | [0025_great_valkyrie.sql](../drizzle/0025_great_valkyrie.sql) | Specific commodity descriptions ("Used vehicle — sedan 2018", "Coffee beans Robusta"). Finer than `type_of_goods_master_t`; attaches to a customs declaration line. |
| `transit_point_master_t` | [src/db/schema/transitPointMaster.ts](../src/db/schema/transitPointMaster.ts) | [0025_great_valkyrie.sql](../drizzle/0025_great_valkyrie.sql) | Every customs touchpoint along a route (ports, border crossings, warehouses). Six boolean flags (`entry_point`, `exit_point`, `loading`, `destination`, `warehouse`, `location`) say which roles the point can play — lets imports/exports pickers filter per-field (e.g. only show entry-point eligible rows when picking an `entry_point_id`). |
| `document_status_master_t` | [src/db/schema/documentStatusMaster.ts](../src/db/schema/documentStatusMaster.ts) | [0025_great_valkyrie.sql](../drizzle/0025_great_valkyrie.sql) | Where a customs declaration's paperwork stands ("CRF Received", "DGDA In", "Audited"). `type` is a 2-char direction code (I/E/U + combinations) limiting which entities the status applies to. |
| `clearing_status_master_t` | [src/db/schema/clearingStatusMaster.ts](../src/db/schema/clearingStatusMaster.ts) | [0025_great_valkyrie.sql](../drizzle/0025_great_valkyrie.sql) | Operational pipeline status ("Pre-Alert", "Declaration Submitted", "Released"). `imports_t.clearing_status` FKs here — tracks progress alongside the workflow `state`. |
| `feet_container_master_t` | [src/db/schema/feetContainerMaster.ts](../src/db/schema/feetContainerMaster.ts) | [0027_free_zemo.sql](../drizzle/0027_free_zemo.sql) | Container size catalogue (20-foot, 40-foot, 40-foot HC, …). Prereq for `exports_t.feet_container_id` — every sea/road container picks its size from this master. |
| `truck_status_master_t` | [src/db/schema/truckStatusMaster.ts](../src/db/schema/truckStatusMaster.ts) | [0027_free_zemo.sql](../drizzle/0027_free_zemo.sql) | Operational truck status ("At Loading", "En Route to Border", "Crossed", "Delivered"). Prereq for `exports_t.truck_status` — distinct from `imports_t.truck_status` which stays a plain varchar because imports use a different operational pipeline. |
| `origin_master_t` | [src/db/schema/originMaster.ts](../src/db/schema/originMaster.ts) | [0029_conscious_zarda.sql](../drizzle/0029_conscious_zarda.sql) | Country-of-origin catalogue ("DRC", "Zambia", "South Africa"). Parent FK for `province_master_t` — every province nests under one origin. Used by future shipping-origin / certificate-of-origin flows. |
| `province_master_t` | [src/db/schema/provinceMaster.ts](../src/db/schema/provinceMaster.ts) | [0029_conscious_zarda.sql](../drizzle/0029_conscious_zarda.sql) | Province / sub-national region. FK to `origin_master_t` so the picker can scope to "all provinces in DRC", etc. Used by client onboarding and any address-bearing record. |
| `industry_master_t` | [src/db/schema/industryMaster.ts](../src/db/schema/industryMaster.ts) | [0029_conscious_zarda.sql](../drizzle/0029_conscious_zarda.sql) | Industry sector catalogue ("Mining", "Agriculture", "Manufacturing"). Picked on client onboarding — drives per-industry filters on dashboards and reports. |
| `done_by_master_t` | [src/db/schema/doneByMaster.ts](../src/db/schema/doneByMaster.ts) | [0029_conscious_zarda.sql](../drizzle/0029_conscious_zarda.sql) | "Done by" attribution catalogue — short name strings used on tracking entries to record which team / external party performed a step. `done_by_name` is unique (one row per distinct attribution). Adapted from main's `done_by_t` to the `_master_t` convention. |
| `expense_type_master_t` | [src/db/schema/expenseTypeMaster.ts](../src/db/schema/expenseTypeMaster.ts) | [0030_wakeful_invaders.sql](../drizzle/0030_wakeful_invaders.sql) | Expense type catalogue for invoice / payment-request line items. Five boolean flags (`is_import`, `is_export`, `is_local`, `is_advance`, `is_other`) scope which contexts each entry applies to — downstream pickers filter by the relevant flag. Multiple flags per row are allowed. Renamed from main's bare column names (`import`/`export`/etc.) to `is_*` to avoid SQL reserved-word collisions and read more clearly as predicates. |
| `hscode_master_t` | [src/db/schema/hscodeMaster.ts](../src/db/schema/hscodeMaster.ts) | [0030_wakeful_invaders.sql](../drizzle/0030_wakeful_invaders.sql) | HS (Harmonized System) code tariff catalogue. Five `numeric(5,2)` percent rates per row: `ddi` (import duty), `ica` (sales tax), `dci` (excise), `dcl` (export duty), `tpi` (industry promotion). Defaults to `0.00` so lookup-before-rate-entered doesn't break Fiche de Calcul math. Per the TODO in the schema file, these rates should eventually move to `tax_rule_master_t` (JSON Logic formulas) — kept inline for now to match the source and let operators edit rates on the form directly. |
| `banklist_master_t` | [src/db/schema/banklistMaster.ts](../src/db/schema/banklistMaster.ts) | [0031_clean_night_nurse.sql](../drizzle/0031_clean_night_nurse.sql) | Registered bank catalogue (BCC, Rawbank, Equity BCDC, …). Picked on invoice / payment-request forms when capturing where money flows to or from. `for_exchange` (boolean) flags banks that are sources for daily exchange-rate entries — distinct from "banks the client transacts through". `bank_code` is partial-unique by `display='Y'`. Adapted from main's Y/N flag to a proper boolean per the branch convention. |
| `phase_master_t` | [src/db/schema/phaseMaster.ts](../src/db/schema/phaseMaster.ts) | [0032_red_centennial.sql](../drizzle/0032_red_centennial.sql) | Workflow phase catalogue — operator-visible labels for the current stage on tracking entries ("Documentation", "Customs Clearance", "Delivered"). Distinct from `workflow_master_t` state which is the machine state behind the scenes. |
| `incoterm_master_t` | [src/db/schema/incotermMaster.ts](../src/db/schema/incotermMaster.ts) | [0032_red_centennial.sql](../drizzle/0032_red_centennial.sql) | Incoterm catalogue — the international commercial-terms codes (FOB, CIF, EXW, DDP, …) that pin who bears cost and risk at each step. Two columns: short code (3 letters) + full descriptive name. |
| `group_company_master_t` | [src/db/schema/groupCompanyMaster.ts](../src/db/schema/groupCompanyMaster.ts) | [0032_red_centennial.sql](../drizzle/0032_red_centennial.sql) | Group / parent company catalogue. Clients in a larger holding reference their group_company here so reporting can roll up consignment totals per group. |
| `referer_master_t` | [src/db/schema/refererMaster.ts](../src/db/schema/refererMaster.ts) | [0032_red_centennial.sql](../drizzle/0032_red_centennial.sql) | Referrer / introducer catalogue ("Direct", "Trade show 2024", "Agent X"). Picked on client onboarding for marketing attribution. Fixes main's `refferer_name` double-f typo to `referer_name`. |
| `payment_type_master_t` | [src/db/schema/paymentTypeMaster.ts](../src/db/schema/paymentTypeMaster.ts) | [0032_red_centennial.sql](../drizzle/0032_red_centennial.sql) | Payment method catalogue ("Bank transfer", "Cash", "Cheque", "Mobile money"). Parent FK for `payment_subtype_master_t` — each type can have multiple subtypes. |
| `payment_subtype_master_t` | [src/db/schema/paymentSubtypeMaster.ts](../src/db/schema/paymentSubtypeMaster.ts) | [0032_red_centennial.sql](../drizzle/0032_red_centennial.sql) | Payment subtype catalogue nested under `payment_type_master_t` ("SWIFT" under "Bank transfer", "Airtel Money" under "Mobile money"). FK to parent type so pickers can scope by payment-type. |
| `invoice_bank_master_t` | [src/db/schema/invoiceBankMaster.ts](../src/db/schema/invoiceBankMaster.ts) | [0033_old_tony_stark.sql](../drizzle/0033_old_tony_stark.sql) | The company's own bank accounts printed on outgoing invoices ("remit to" footer). Five fields: bank name, account name, account number, SWIFT, address. Distinct from `banklist_master_t` (the registry of registered banks, including ones the company doesn't use itself). Multiple rows are normal — operators sometimes route different currencies through different banks. |
| `department_master_t` | [src/db/schema/departmentMaster.ts](../src/db/schema/departmentMaster.ts) | [0035_curvy_kinsey_walden.sql](../drizzle/0035_curvy_kinsey_walden.sql) | Internal department catalogue ("Operations", "Finance", "Customer Service"). Picked on user records and payment-request entries so cost centres can be reported per department. |

## Transaction-page configuration (§4.5 / §4.12)

The metadata behind every non-master screen — `/clients`, `/license`, `/import`, `/export`, `/local`, `/payments` and the invoice pages. These were created directly on the production database and only became migrations in [0041_add_master_page_and_office_tables.sql](../drizzle/0041_add_master_page_and_office_tables.sql); their content is seeded by [src/db/seed/masterPages.ts](../src/db/seed/masterPages.ts).

| Table | Schema file | Migration | Purpose |
| ----- | ----------- | --------- | ------- |
| `master_page_t` | [src/db/schema/masterPage.ts](../src/db/schema/masterPage.ts) | [0041_…](../drizzle/0041_add_master_page_and_office_tables.sql) | One row per transactional page: slug, title, route, and the `target_table` it writes to (resolved through a server-side whitelist, never trusted from the row). |
| `master_page_accordion_t` | [src/db/schema/masterPageAccordion.ts](../src/db/schema/masterPageAccordion.ts) | [0041_…](../drizzle/0041_add_master_page_and_office_tables.sql) | The collapsible sections a page renders, in `display_order`. |
| `master_page_accordion_field_t` | [src/db/schema/masterPageAccordionField.ts](../src/db/schema/masterPageAccordionField.ts) | [0041_…](../drizzle/0041_add_master_page_and_office_tables.sql) | Every field on an accordion: `field_type`, options source, `props`, plus the `conditions` (visibleWhen / requiredWhen) and `derive` (fromRelated / template / tiered / statusMap / count) JSON the form runtime evaluates. |
| `master_page_accordion_role_t` | [src/db/schema/masterPageAccordionRole.ts](../src/db/schema/masterPageAccordionRole.ts) | [0041_…](../drizzle/0041_add_master_page_and_office_tables.sql) | Per-role view/edit grant on an accordion. |
| `master_page_accordion_field_role_t` | [src/db/schema/masterPageAccordionFieldRole.ts](../src/db/schema/masterPageAccordionFieldRole.ts) | [0041_…](../drizzle/0041_add_master_page_and_office_tables.sql) | Per-role view/edit/hidden override on a single field — the accordion-scoped sibling of `form_field_role_t`. |
| `master_bulk_filter_t` | [src/db/schema/masterBulkFilter.ts](../src/db/schema/masterBulkFilter.ts) | [0041_…](../drizzle/0041_add_master_page_and_office_tables.sql) | Named bulk-edit filters per page ("CRF Missing", "Quittance Pending", …): a `predicate` JSON the list query compiles to a WHERE clause plus the `editable_fields` the bulk editor exposes. |

## Other tables

| Table | Schema file | Migration | Purpose |
| ----- | ----------- | --------- | ------- |
| `main_office_master_t` | [src/db/schema/mainOfficeMaster.ts](../src/db/schema/mainOfficeMaster.ts) | [0041_…](../drizzle/0041_add_master_page_and_office_tables.sql) | The company's own offices (Lubumbashi, Kolwezi, Kasumbalesa, Likasi, Kinshasa). Referenced by seal batches, payment requests and local tracking. Replaces the earlier `office_master_t`, dropped in [0042](../drizzle/0042_drop_legacy_office_master.sql). |
| `office_location_master_t` | [src/db/schema/officeLocationMaster.ts](../src/db/schema/officeLocationMaster.ts) | [0041_…](../drizzle/0041_add_master_page_and_office_tables.sql) | Province-scoped client locations (FK to `province_master_t`). Picked on client onboarding — distinct from `main_office_master_t`, which is *our* offices. |
| `notification_outbox_t` | [src/db/schema/notificationOutbox.ts](../src/db/schema/notificationOutbox.ts) | [0011_add_notification_outbox.sql](../drizzle/0011_add_notification_outbox.sql) | Transactional outbox for `notify` side effects. `case-runtime/advanceCase` writes rows here in the same transaction as the entity UPDATE — a dispatcher worker polls `status='pending'`. |
| `audit_log_t` | [src/db/schema/auditLog.ts](../src/db/schema/auditLog.ts) | [0019_useful_slyde.sql](../drizzle/0019_useful_slyde.sql) | Append-only audit log. Every user-initiated create / update / delete / transition goes through [recordAudit](../src/lib/audit/recordAudit.ts) inside the calling transaction, so audit rolls back with the write. [redact](../src/lib/audit/redact.ts) scrubs sensitive field names (password, *_token, secret, api_key, private_key) from `before` / `after` snapshots; `diff` is a pre-computed per-field `{ from, to }` map so detail panels don't re-derive it. CHECK constraints pin `actor_type` to user/system/api and `action` to the seven supported verbs. |
| `bank_exchange_rate_t` | [src/db/schema/bankExchangeRate.ts](../src/db/schema/bankExchangeRate.ts) | [0031_clean_night_nurse.sql](../drizzle/0031_clean_night_nurse.sql) | Daily bank exchange rate history — one row per `(bank_id, currency_id, exchange_date)` (unique index). `bcc_rate` is the Banque Centrale du Congo official rate for that day; `bank_rate` is the actual rate the bank used — both matter because invoice rounding can use either depending on regime. Transactional (`_t`, not `_master_t`); UI lives at `/bank-exchange-rates`. Drops main's redundant `currency_code` varchar since the value already comes off the `currency_master_t` join — [db-reconcile.sql](../scripts/db-reconcile.sql) drops that column from a dump-restored database. |

> **Every master table the spec called out (CLAUDE.md §4.1 / §2) is now schema'd.** Future work is about wiring them up (seeding workflows for tracking / payment request / approval, building the dispatcher worker), not adding more tables.

## Provisioning a database from scratch

`pnpm db:migrate && pnpm db:seed` now builds a database with the same shape *and*
the same reference content production runs on — [scripts/setup-db.ts](../scripts/setup-db.ts)
(restore main's dump + [db-reconcile.sql](../scripts/db-reconcile.sql)) is no
longer the only path.

A database that came from a dump has its migration bookkeeping *baselined*, so
the §4 engine tables (rules / workflows / forms / case templates / statuses /
validations) were never created and `db:seed` fails on the first seed that
touches one. [0044](../drizzle/0044_backfill_engine_tables.sql) re-issues just
those objects, guarded, so it is a no-op on a migration-built database and
repairs a baselined one — see the README for the two-command sequence.

The bulk reference data is captured from production as JSON under
[src/db/seed/data](../src/db/seed/data) and written by
[insertSeedRows](../src/db/seed/insertSeedRows.ts):

| Seed | Payload | Contents |
| ---- | ------- | -------- |
| [roleCatalogue.ts](../src/db/seed/roleCatalogue.ts) | `role-catalogue.json` | Production's 50 roles. Must run before anything that grants permissions — `seedPaymentStageRoles` maps the approval chain onto roles 3/5/10/11 and the page grants reference role 52. |
| [referenceMasters.ts](../src/db/seed/referenceMasters.ts) | `reference-masters.json` | 31 DRC lookup masters: currencies, origins/provinces, offices/locations, transit points, transport modes, goods types, kinds, regimes, clearance + document/truck/clearing status vocabularies, 632 commodities, incoterms, phases, departments, expense types, banks, payment types/subtypes, quotation categories, 148 billable items, the public-holiday calendar, and the bank exchange-rate history. |
| [masterPages.ts](../src/db/seed/masterPages.ts) | `master-pages.json` | The transaction-page config above — 8 pages, 23 accordions, 302 fields, 39 role grants, 24 bulk filters. |

Rows keep their production ids on purpose: the page config, bulk-filter
predicates and derive/conditions rules all reference masters by id (`kind_id`
5/6/7 are the MCA kinds, `transport_mode` 1 is ROAD, …), so renumbering would
silently break the forms. `created_by` / `updated_by` are blanked because a
freshly migrated database has no users until `scripts/seed-admin.js` runs, and
`created_at` / `updated_at` fall back to their column defaults.

Re-capture the JSON only when the baseline every deployment should start from
actually moves; day-to-day additions are config changes made in the admin
screens.

The sidebar ([menus.ts](../src/db/seed/menus.ts)) and the dashboard cards
([dashboardCards.ts](../src/db/seed/dashboardCards.ts)) stay hand-curated —
they're structural decisions, not captured data — but their content is kept at
parity with production: the seeded sidebar renders the same 94 visible entries,
and the 46 dashboard cards match key-for-key. Production also carries four
hidden (`display='N'`, `url='#'`) duplicates of Local Tracking / Local Dashboard
/ Import KPI / Export KPI left over from before those pages shipped; the seed's
natural key is `menu_name` within a parent, so it emits only the live row.

## Conventions

When you add a new master table, do all of:

1. Create `src/db/schema/<domain>.ts` with the `_master_t` table + relations.
2. Re-export from [src/db/schema/index.ts](../src/db/schema/index.ts).
3. Run `npm run db:generate` → review the generated `drizzle/*.sql` → commit it.
4. If the table contains slow-changing reference data, add a seed entry under `src/db/seed/`.
5. Add the table to the right section above in this file.
6. (When dynamic forms / case-runtime are live) Wire a `form_definition_master_t` row and a `case_template_master_t` row so the admin CRUD UI auto-renders.
