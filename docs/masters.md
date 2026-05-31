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

## Pending — domain masters (§2 consignment flow)

These are referenced in CLAUDE.md §2/§4.1 but don't have schemas yet. Add them here once the table lands.

- [ ] `status_master_t` — status codes per entity type
- [ ] `document_type_master_t`
- [ ] `license_type_master_t` (IB / Export)
- [ ] `tracking_template_master_t`
- [ ] `tax_rule_master_t` — Fiche de Calcul rule rows
- [ ] `approval_hierarchy_master_t`
- [ ] `field_validation_master_t`
- [ ] `feature_toggle_master_t`

## Conventions

When you add a new master table, do all of:

1. Create `src/db/schema/<domain>.ts` with the `_master_t` table + relations.
2. Re-export from [src/db/schema/index.ts](../src/db/schema/index.ts).
3. Run `npm run db:generate` → review the generated `drizzle/*.sql` → commit it.
4. If the table contains slow-changing reference data, add a seed entry under `src/db/seed/`.
5. Add the table to the right section above in this file.
6. (When dynamic forms / case-runtime are live) Wire a `form_definition_master_t` row and a `case_template_master_t` row so the admin CRUD UI auto-renders.
