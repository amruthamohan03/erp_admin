# CLAUDE.md — Masters module

Scope: every reference / lookup / configuration table that backs dropdowns, status pickers, classifications, hierarchies, and workflow inputs across the ERP. Read the root [CLAUDE.md](../../../CLAUDE.md) first — this file only documents what is *specific* to masters.

---

## 1. What "masters" means here

A master table holds **slowly-changing reference data** that the business owns (not developers). Three properties are non-negotiable:

1. **Editable at runtime** by an authorized user through a generic admin screen — never via code deploy.
2. **Soft-deletable** via the `display` flag (`Y`/`N`). No row is ever physically removed; foreign keys must remain valid.
3. **Audited** — every row carries `created_by`, `updated_by`, `created_at`, `updated_at`.

If a proposed table doesn't satisfy all three, it is not a master — it's either transactional data or a hardcoded enum, and belongs elsewhere.

---

## 2. Naming convention (real, not the spec)

The root CLAUDE.md mentions a `master_*` prefix. The **actual codebase uses an `_master_t` suffix** — follow the code, not the spec. When you next touch the root CLAUDE.md, flag the drift to the user.

| Layer       | Convention                                | Example                                       |
|-------------|-------------------------------------------|-----------------------------------------------|
| SQL table   | `<domain>_master_t`                       | `role_master_t`, `currency_master_t`          |
| Drizzle var | `<domain>Master` (camelCase)              | `roleMaster`, `currencyMaster`                |
| File path   | `src/db/schema/<domain>.ts`               | `src/db/schema/roles.ts`                      |
| Types       | `<Domain>MasterRow`, `<Domain>MasterInsert` | `RoleMasterRow`, `CurrencyMasterInsert`     |
| API route   | `src/app/api/<plural-domain>/...`         | `/api/currencies`, `/api/hscodes`             |

Exception observed in the schema list: `final_bonded_warehouse_t` has no `_master_` infix. Keep it that way if it already exists in the DB — never rename a live table to satisfy a convention.

Spelling carryover: `refferer_master_t` is misspelled in the DB. Preserve the SQL identifier as-is, but expose it as `referrerMaster` in Drizzle and `/api/referrers` at the API boundary so consumers don't inherit the typo. Add a one-line comment on the Drizzle table noting the SQL spelling.

---

## 3. Standard column set

Every master table has the same audit + soft-delete tail. Copy this block verbatim — deviations need a reason:

```ts
display: varchar('display', { length: 1 }).notNull().default('Y'),
createdBy: integer('created_by'),
updatedBy: integer('updated_by'),
createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
```

Notes:
- `withTimezone: false` matches the existing tables. Don't switch to `true` for one new master.
- `display` is the soft-delete flag. **List endpoints filter `eq(display, 'Y')`** — see [src/app/api/roles/route.ts:31](../../app/api/roles/route.ts#L31).
- `createdBy` / `updatedBy` come from `session.uid` in the route handler, not from the request body.
- Primary key is always `serial('id').primaryKey()` for master tables in this codebase (matches `role_master_t`, `menu_master_t`). Don't switch to `uuid` for a single master.

Self-referential FKs (parent/child hierarchies, e.g. office → sub-office) use the `AnyPgColumn` typed back-reference pattern from [src/db/schema/roles.ts:14](../../db/schema/roles.ts#L14).

---

## 4. Catalog of master tables in scope

Grouped by lifecycle stage from the root CLAUDE.md §2. Each row is a table this module owns. "Drives" = where the value is consumed downstream.

### Identity & org structure
| Table | Drives |
|---|---|
| `role_master_t` | user role assignment, approval hierarchy, permission matrix |
| `department_master_t` | user.dept, expense routing, report grouping |
| `office_location_master_t` | user.location, license issuing office, branch reporting |
| `sub_office_master_t` | child of office; sub-branch routing |

### Counterparty classification (client onboarding)
| Table | Drives |
|---|---|
| `refferer_master_t` *(sic — referrer)* | how a client was sourced |
| `category_master_t` | client category (e.g. importer, exporter, agent) |
| `industry_master_t` | client industry / sector |
| `kind_master_t` | client kind (legal form: SARL, SA, individual, etc.) |

### Goods & classification
| Table | Drives |
|---|---|
| `type_of_goods_master_t` | high-level commodity grouping |
| `hscode_master_t` | HS classification — drives duty rates in Fiche de Calcul |
| `item_master_t` | catalog of named items shipped |
| `unit_master_t` | quantity units (kg, L, pcs, m³) |

### Finance, banking & currency
| Table | Drives |
|---|---|
| `banklist_master_t` | bank directory (counterparty banks) |
| `invoice_bank_master_t` | our bank accounts that appear on issued invoices |
| `currency_master_t` | currency codes; pair with FX rate table elsewhere |
| `payment_type_master_t` | inflow vs outflow vs adjustment etc. |
| `payment_method_master_t` | cash / bank transfer / cheque / mobile money |
| `payment_subtype_master_t` | child of method (e.g. M-Pesa under mobile money) |
| `expense_type_master_t` | expense categorization for payment requests |
| `perdiem_master_t` | per-diem rate table (role × location, typically) |

### Customs, clearance & document state
| Table | Drives |
|---|---|
| `clearance_master_t` | clearance procedure code |
| `regime_master_t` | customs regime (IM4, EX1, transit, etc.) |
| `clearing_status_master_t` | clearance workflow state values |
| `document_status_master_t` | doc lifecycle state |
| `truck_status_master_t` | truck movement state |
| `entry_post_master_t` | customs entry post / border crossing in |
| `exit_point_master_t` | customs exit point / border crossing out |
| `transit_point_master_t` | intermediate transit checkpoint |
| `final_bonded_warehouse_t` | bonded warehouse destinations (note: no `_master_` infix) |
| `phase_master_t` | named workflow phase (tracking sub-stage) |
| `seal_master_t` | seal numbers / seal types for containers |

### Logistics & trade terms
| Table | Drives |
|---|---|
| `transport_mode_master_t` | road / sea / air / rail |
| `loading_site_master_t` | port / depot of loading |
| `feet_container_master_t` | container size codes (20', 40', 40'HC, …) |
| `incoterm_master_t` | EXW / FOB / CIF / DAP / etc. |

### Geography
| Table | Drives |
|---|---|
| `origin_master_t` | country/place of origin of goods |
| `destination_master_t` | country/place of final destination |
| `province_master_t` | DRC province (or country subdivision) |

When you add a master that doesn't fit a group above, **add it to this table first**, then implement. If the grouping is wrong, ask before inventing a new section.

---

## 5. Standard schema template

Drop-in for a new master with no special columns:

```ts
// src/db/schema/currencies.ts
import { pgTable, serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';

export const currencyMaster = pgTable('currency_master_t', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 10 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  symbol: varchar('symbol', { length: 8 }),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by'),
  updatedBy: integer('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type CurrencyMasterRow = typeof currencyMaster.$inferSelect;
export type CurrencyMasterInsert = typeof currencyMaster.$inferInsert;
```

Then re-export from [src/db/schema/index.ts](../../db/schema/index.ts).

For a hierarchical master (e.g. payment_method → payment_subtype, office → sub_office), use the self-reference pattern from [src/db/schema/roles.ts:14](../../db/schema/roles.ts#L14) with `AnyPgColumn` and `relations(...)`.

---

## 6. Standard API shape

All master endpoints follow the existing pattern in [src/app/api/roles/route.ts](../../app/api/roles/route.ts):

- `GET /api/<plural>` → list active rows (`display = 'Y'`), ordered by `id` asc, joined to display fields of any parent FK.
- `POST /api/<plural>` → Zod-validated create, returns the inserted row with `201`.
- `GET /api/<plural>/[id]` → single row.
- `PUT /api/<plural>/[id]` → update; set `updatedBy = session.uid`.
- `DELETE /api/<plural>/[id]` → soft delete (set `display = 'N'`), **never** a real delete.

Conventions to copy verbatim:
- Auth check first: `const session = await getSession(); if (!session) return fail('Unauthorized', 401);`
- Response envelope via `ok()` / `fail()` from [src/lib/api.ts](../../lib/api.ts).
- API field names are **snake_case** in request and response (`role_name`, `parent_role_id`) — the snake↔camel map happens in the handler when calling Drizzle.
- FK-violation handling: catch `e.code === '23503'` and return a 400 with a specific message — see [src/app/api/roles/route.ts:85](../../app/api/roles/route.ts#L85).
- Zod schema declared at the top of the route file is fine for now; if a schema is reused across routes, move it to `src/schemas/`.

---

## 7. Doing it dynamically (preferred path)

Hand-writing 35+ near-identical CRUD routes is exactly what the root CLAUDE.md §4.3 (template-driven modules) and §4.5 (dynamic forms) warn against. Before adding a new master, check whether the generic master runtime exists yet:

- If a generic `[masterKey]` route + `master_form_definition` registry exists → **register the new master there**, don't write a bespoke route.
- If it doesn't exist yet → it's fine to hand-write the first few using the template in §6, but raise the question of building the generic runtime with the user once you have 3+ near-identical handlers.

When you find yourself copy-pasting a third master route, stop and propose the generic version.

---

## 8. Seeds

Every new master needs a seed entry in `src/db/seed/` so a fresh environment boots with sensible defaults (currency codes, incoterms, regime codes, etc.). A master with zero seed rows is acceptable only if the values are entirely deployment-specific (e.g. `office_location_master_t`).

Seeds are idempotent: use `onConflictDoNothing()` keyed on the natural unique column (`code`, `name`), never on `id`.

---

## 9. Checklist before declaring a new master done

- [ ] Drizzle schema in `src/db/schema/<domain>.ts`, re-exported from `index.ts`.
- [ ] Migration generated via `pnpm db:generate`, SQL reviewed, committed.
- [ ] Standard audit + `display` columns present.
- [ ] Seed entry (or explicit note that seed is environment-specific).
- [ ] CRUD routes (or registration in the generic runtime).
- [ ] Zod schema for create + update.
- [ ] FK error (`23503`) handled where this master is referenced by others.
- [ ] Catalog table in §4 of this file updated.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` clean.

---

## 10. Things to refuse for masters specifically

- Hard deletes on a master row → use `display = 'N'`.
- Editing the natural code column (`code`, `iso_code`, `hs_code`) after creation if it's referenced elsewhere → propose deactivate + new row.
- Embedding master values as enums in TS (`type Currency = 'USD' | 'CDF'`) → fetch from the table.
- Adding a column "just for one report" → that's a report join, not a master column.
- Skipping the `display` filter on a list endpoint → soft-deleted rows must not leak to dropdowns.
