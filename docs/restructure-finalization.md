# Restructure → main parity: DB & data finalization

## 🚀 Collaborator setup (get the branch running from scratch)

**Prereqs:** Node + pnpm; PostgreSQL (on Windows add `C:\Program Files\PostgreSQL\18\bin` to
PATH, or full-path `createdb`/`psql`/`pg_dump`); and access to main's data — either a running
`erp_admin_main` DB **or** the `erp_admin_main.sql` dump.

```bash
# 1. Install deps
pnpm install

# 2. Create .env.local (keys below) pointing PGDATABASE at erp_admin_restructure

# 3. ONE command: creates the DB, loads main's data, reconciles names + form
#    config, and reseeds the sidebar + dashboard cards.
pnpm setup:db --from-dump path/to/erp_admin_main.sql   # from the SQL dump
#   …or, if you have a live main DB:
#   pnpm setup:db --from-db erp_admin_main
#   (add --force to drop & recreate an existing target DB)

# 4. Run — http://localhost:3000, log in with a main user (e.g. admin)
pnpm dev
```

`setup:db` reads the target DB + creds from `.env.local` and auto-finds `psql`/`pg_dump`
(PATH, or `C:\Program Files\PostgreSQL\NN\bin`). The individual steps are also available if
you prefer to run them by hand: `scripts/db-reconcile.sql` (`psql -f`), `pnpm reseed:nav`,
`pnpm reseed:cards`.

`.env.local` (step 2):
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/erp_admin_restructure
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=erp_admin_restructure
JWT_SECRET=<any 32+ character string>
```

Sanity check anytime: `pnpm typecheck && pnpm lint && pnpm test` (all green).

> **Do NOT** use `drizzle-kit push` + `pnpm db:seed` for this branch: that produces restructure's
> *own* seed data without main's real records or the `master_page_*` form config (so forms render
> no fields), and `db:seed` still runs the removed features' seeds. Clone-from-main (above) is the
> supported path. The `drizzle-kit generate/migrate` route is only for migrating an existing DB
> in place (see §2 below).

---

## ✅ Actual setup performed (clone-and-reconcile — recommended)

Because main's DB already holds the exact column model **and** the `master_page_*` form
config, the fastest reliable path was to clone it and rename the few tables where restructure
kept different SQL names — no interactive `drizzle-kit` migration needed. What was run
(all on `localhost:5432`, user `postgres`; tools at `C:\Program Files\PostgreSQL\18\bin`):

```sql
-- 1) Clone main -> a fresh restructure DB (non-destructive to erp_admin_db / erp_admin_main):
--    createdb erp_admin_restructure ; pg_dump erp_admin_main --no-owner --no-privileges | psql erp_admin_restructure
-- 2) Reconcile table/column names to what the restructure code expects:
ALTER TABLE clients_t                 RENAME TO client_master_t;
ALTER TABLE licenses_t                RENAME TO license_t;
ALTER TABLE seal_nos_t                RENAME TO seal_batch_t;
ALTER TABLE seal_individual_numbers_t RENAME TO seal_number_t;
ALTER TABLE refferer_master_t         RENAME TO referer_master_t;
ALTER TABLE done_by_t                 RENAME TO done_by_master_t;
ALTER TABLE partial_t                 RENAME TO partial_master_t;
ALTER TABLE seal_number_t    RENAME COLUMN seal_master_id TO seal_batch_id;
ALTER TABLE referer_master_t RENAME COLUMN refferer_name  TO referer_name;
ALTER TABLE client_master_t  ADD COLUMN IF NOT EXISTS id_nat_file_id integer;
ALTER TABLE client_master_t  ADD COLUMN IF NOT EXISTS rccm_file_id integer;
ALTER TABLE client_master_t  ADD COLUMN IF NOT EXISTS import_export_file_id integer;
ALTER TABLE client_master_t  ADD COLUMN IF NOT EXISTS attestation_file_id integer;
ALTER TABLE done_by_master_t ADD COLUMN IF NOT EXISTS created_by integer;
ALTER TABLE done_by_master_t ADD COLUMN IF NOT EXISTS updated_by integer;
-- 3) Point the master_page form config at restructure's table/route names:
UPDATE master_page_t SET target_table='client_master_t' WHERE slug='clients';
UPDATE master_page_t SET target_table='license_t'       WHERE slug='license';
UPDATE master_page_accordion_field_t SET options_source='goods-types' WHERE options_source='type-of-goods';
```

Then `.env.local` `DATABASE_URL`/`PGDATABASE` were pointed at **`erp_admin_restructure`**.
Verified: all reshaped columns the app selects exist, and the 240-row form config loaded.

**Navigation config** — the clone also brought main's `menu_master_t` (URLs like `clients/`,
`import/index` that 404 on restructure routes). Fixed by reseeding the authoritative
restructure sidebar and pruning links to removed features:

```bash
# clears menu_master_t + role_menu_mapping_t, reseeds restructure's SPEC (correct /… URLs,
# re-grants Super Admin role_id=1), via src/db/seed/menus.ts:
npx tsx --env-file-if-exists=.env.local scripts/reseed-navigation.ts
# then prune menu rows whose pages were removed in Stage 5 (reports/tracking/invoices/
# credit-notes/payment-requests/fiche-de-calcul/masters/forms|partials|payment-types|
# payment-subtypes/mapping/fieldgrants/*dashboard) + any empty parent groups.
```

> **Same applies to `dashboard_card_master_t`** — main's rows carry main `card_url`/`data_source`
> values. If the dashboard tiles link/aggregate wrong, reseed them from
> `src/db/seed/dashboardCards.ts` the same way (clear `role_dashboard_card_mapping_t` +
> `dashboard_card_master_t`, then run `seedDashboardCards(db)`).

Notes: the ~13 restructure-only backend tables (`case_template_master_t`, `workflow_master_t`,
`invoice_t`, `tracking_t`, …) are intentionally **absent** from this DB — the app no longer
queries them (their features were removed), so nothing needs them. Log in with your existing
main users (e.g. `admin`) and their existing passwords (the `users_t` rows came from main).

The `drizzle-kit generate`/`migrate` path below remains valid if you'd rather migrate an
existing DB in place instead of cloning.

---


The code migration (all of main's UI pages, the transactional data model, and main's
`TransactionalPage` metadata form runtime) is complete and the project is
typecheck + lint + test green. Two steps remain that touch your **database**, not the
code, and must be run in your environment.

---

## 1. Load the `master_page_*` form config

Main's create/edit forms (clients / import / export / license) render their accordions
and fields from six config tables. Restructure now has those tables with an **identical
structure** to main, but they're empty. Copy the data from main's DB, then apply the small
adjustments below.

> **Prerequisite — do §2 (migrations) first.** The six `master_page_*` tables are *new* in
> restructure; they must already exist in the restructure DB (created by applying the
> migration) before you can load data into them, or you'll get `relation ... does not exist`.

> **Windows / `pg_dump` not found:** the PostgreSQL tools are at
> `C:\Program Files\PostgreSQL\18\bin\`. Either add it to PATH for the session
> (PowerShell: `$env:Path += ';C:\Program Files\PostgreSQL\18\bin'`) or call the exes by full
> path as shown below.

### 1a. Copy the six config tables from main → restructure

**bash / psql on PATH:**
```bash
pg_dump --data-only \
  -t master_page_t -t master_page_accordion_t -t master_page_accordion_field_t \
  -t master_page_accordion_role_t -t master_page_accordion_field_role_t \
  -t master_bulk_filter_t \
  "$MAIN_DATABASE_URL" | psql "$RESTRUCTURE_DATABASE_URL"
```

**Windows PowerShell (full paths; via a temp file — more reliable than piping two exes):**
```powershell
$pg = 'C:\Program Files\PostgreSQL\18\bin'
& "$pg\pg_dump.exe" --data-only `
  -t master_page_t -t master_page_accordion_t -t master_page_accordion_field_t `
  -t master_page_accordion_role_t -t master_page_accordion_field_role_t `
  -t master_bulk_filter_t `
  "$env:MAIN_DATABASE_URL" > master_page_config.sql
& "$pg\psql.exe" "$env:RESTRUCTURE_DATABASE_URL" -f master_page_config.sql
```

**No live `main` DB (only the `erp_admin_main.sql` file)?** The six tables' rows are already
in that dump. Extract just their `COPY public.master_page*` / `master_bulk_filter_t` blocks
(each runs from its `COPY … FROM stdin;` line to the terminating `\.`) into a file and
`psql … -f` it into restructure — same result, no `pg_dump` needed. (Ask me and I'll generate
that filtered load file from the dump.)

### 1b. Adjust `target_table` to restructure's SQL table names

The reshaped transactional tables kept restructure's SQL names for two of the four; the
form runtime resolves the target table from `master_page_t.target_table`, so fix those two
(import/export already match main):

```sql
UPDATE master_page_t SET target_table = 'client_master_t' WHERE slug = 'clients';
UPDATE master_page_t SET target_table = 'license_t'       WHERE slug = 'license';
-- slug='import'  → imports_t  (already correct)
-- slug='export'  → exports_t  (already correct)
```

Field **names** in the config already match restructure's columns, because the tables were
reshaped to main's exact column names (`company_name`, `kind`, `type_of_goods`,
`license_number`, `fob_declared`, …).

### 1c. Adjust renamed option-source slugs

A field's dropdown options are fetched from `/api/v1/{options_source}`. One master route was
renamed in restructure (`type-of-goods` → `goods-types`); repoint the config:

```sql
UPDATE master_page_accordion_field_t
   SET options_source = 'goods-types'
 WHERE options_source = 'type-of-goods';
```

All other `options_source` slugs (`clients`, `kinds`, `currencies`, `regimes`,
`transport-modes`, `banks`, `office-locations`, `transit-points`, `clearances`,
`commodities`, `payment-types`, `payment-subtypes`, `partials`, `provinces`, `origins`,
`units`, `feet-containers`, `incoterms`, `document-statuses`, `clearing-statuses`,
`truck-statuses`, `invoice-banks`, `items`, `quotation-categories`, `done-by`) already have
matching `/api/v1/…` routes.

---

## 2. Generate the migration

The Drizzle schema changed substantially (four transactional tables reshaped to main's
columns, banks `for_exchange` boolean→`Y/N`, regime `type` enum, the offices re-expansion,
and the Stage-5 table drops). `drizzle-kit generate` was **not** run during the code work
because it needs interactive rename-detection and one hand-authored cast.

```bash
pnpm db:generate     # answer the interactive rename prompts — see below
```

### 2a. Answer "is column X renamed to Y?" = **yes** for these (else data is dropped+recreated)

- **clients** (`client_master_t`): `name` → `company_name`, `client_code` → `short_name`.
  (`legal_name`, `tax_id` are genuinely removed; the financial/verification columns —
  `payment_term`, `credit_term`, `verified_by_id`, `approved_by_id`, `contract_validity`,
  `invoice_template`, … — are genuinely added.)
- **imports** (`imports_t`): `kind_id`→`kind`, `type_of_goods_id`→`type_of_goods`,
  `transport_mode_id`→`transport_mode`, `currency_id`→`currency`, `regime_id`→`regime`,
  `types_of_clearance_id`→`types_of_clearance`, `commodity_id`→`commodity`,
  `document_status_id`→`document_status`, `clearing_status_id`→`clearing_status`, and the
  `*_currency_id`→`*_currency` set. (`hscode_id`, `incoterm_id`, `inspection_reports_file_id`
  removed.)
- **exports** (`exports_t`): same `_id`→un-suffixed set incl. `feet_container_id`→
  `feet_container`, `truck_status_id`→`truck_status`. (`hscode_id`/`incoterm_id` removed.)
- **licenses** (`license_t`): near-total replacement of the generic model with main's
  customs columns. Only `license_no`→`license_number` is a clean rename; the rest of the
  generic columns (`license_type_id`, `state`, `amount`, `issue_date`, `expiry_date`,
  `approved_at`, `notes`) are dropped and main's ~40 customs columns added. Review this one
  by hand.
- **offices**: `office_master_t` is dropped; `main_office_master_t` + `office_location_master_t`
  are new tables. The `clients.office_location_id` and seal-batch office FK now point at the
  new tables.

### 2b. Hand-fix the banks boolean→varchar cast

Drizzle emits a bare `SET DATA TYPE varchar(1)` which Postgres rejects for a boolean column.
Replace it in the generated `drizzle/NNNN_*.sql` with an explicit cast:

```sql
ALTER TABLE banklist_master_t ALTER COLUMN for_exchange DROP DEFAULT;
ALTER TABLE banklist_master_t
  ALTER COLUMN for_exchange TYPE varchar(1)
  USING (CASE WHEN for_exchange THEN 'Y' ELSE 'N' END);
ALTER TABLE banklist_master_t ALTER COLUMN for_exchange SET DEFAULT 'N';
```

### 2c. Expect `DROP TABLE` statements

The Stage-5 cleanup removed the restructure-only tables (case/workflow/tracking/invoice/
credit-note/payment-request/forms-engine/reports/etc.). The generated migration will `DROP`
them — confirm that's intended before applying.

Then apply: `pnpm db:migrate`, and regenerate the API spec: `pnpm openapi`.
