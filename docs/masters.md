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

## Other tables

| Table | Schema file | Migration | Purpose |
| ----- | ----------- | --------- | ------- |
| `notification_outbox_t` | [src/db/schema/notificationOutbox.ts](../src/db/schema/notificationOutbox.ts) | [0011_add_notification_outbox.sql](../drizzle/0011_add_notification_outbox.sql) | Transactional outbox for `notify` side effects. `case-runtime/advanceCase` writes rows here in the same transaction as the entity UPDATE — a dispatcher worker polls `status='pending'`. |
| `audit_log_t` | [src/db/schema/auditLog.ts](../src/db/schema/auditLog.ts) | [0019_useful_slyde.sql](../drizzle/0019_useful_slyde.sql) | Append-only audit log. Every user-initiated create / update / delete / transition goes through [recordAudit](../src/lib/audit/recordAudit.ts) inside the calling transaction, so audit rolls back with the write. [redact](../src/lib/audit/redact.ts) scrubs sensitive field names (password, *_token, secret, api_key, private_key) from `before` / `after` snapshots; `diff` is a pre-computed per-field `{ from, to }` map so detail panels don't re-derive it. CHECK constraints pin `actor_type` to user/system/api and `action` to the seven supported verbs. |

> **Every master table the spec called out (CLAUDE.md §4.1 / §2) is now schema'd.** Future work is about wiring them up (seeding workflows for tracking / payment request / approval, building the dispatcher worker), not adding more tables.

## Conventions

When you add a new master table, do all of:

1. Create `src/db/schema/<domain>.ts` with the `_master_t` table + relations.
2. Re-export from [src/db/schema/index.ts](../src/db/schema/index.ts).
3. Run `npm run db:generate` → review the generated `drizzle/*.sql` → commit it.
4. If the table contains slow-changing reference data, add a seed entry under `src/db/seed/`.
5. Add the table to the right section above in this file.
6. (When dynamic forms / case-runtime are live) Wire a `form_definition_master_t` row and a `case_template_master_t` row so the admin CRUD UI auto-renders.
