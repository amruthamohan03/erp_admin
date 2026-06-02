# CLAUDE.md

Project instructions for Claude. Read this fully before any task.

---

## 1. Project identity

This is a **customs clearance & logistics ERP** for a DRC-based company. It manages the full life of an import/export consignment: **license → quotation → customs clearance → invoice → tax verification → credit note → payment → reporting**.

It is built on a **Master Configuration / Metadata-Driven Architecture**. The Role, Menu, and User Management modules are designed as plug-and-play foundations that future projects will reuse.

The single most important rule: **business logic must not be hardcoded**. Everything that a business analyst might reasonably want to change — workflows, validations, forms, fields, permissions, templates, approval chains, notifications — must be configurable through master tables/UI, not by editing source files.

If a task can be solved either by adding code OR by adding a config row, **prefer the config row**. If neither is possible without new code, the new code must itself be configurable (rule engine, template, plugin point).

---

## 2. Business domain & end-to-end flow

The ERP follows a consignment from onboarding to payment. Every step below maps to a module driven by master configuration — license types, tracking templates, tax rules, invoice formats, and approval hierarchies all live in `master_*` tables.

1. **Client onboarding (Master)** — a client record is created in the master data layer.
2. **License issuance** — a license is issued to the client. Two license types: **Import (IB)** or **Export**.
3. **Tracking** — kicks off based on license type:
   - **Import Tracking** for IB licenses
   - **Export Tracking** for export licenses
   - **Fiche de Calcul** is the calculation tool used during the tracking phase (duties, taxes, fees).
4. **Invoicing** — happens after tracking is complete.
5. **Credit Note** — follows invoicing when a reversal or adjustment is needed.
6. **Payment Request** — runs **in parallel** with the above as an **independent workflow** with **multi-stage approval**.
7. **Reporting** — surfaces across every stage.

When implementing or modifying any feature, identify which stage above it belongs to and confirm the relevant master tables / workflow templates exist before writing logic.

---

## 3. Stack (do not change without asking)

- Next.js 16 (App Router, Turbopack default, `proxy.ts` for route guards)
- React 19.2 + TypeScript 6.0 (strict mode)
- PostgreSQL — accessed via **Drizzle ORM** over a `pg` Pool (`src/lib/db.ts`)
- Drizzle Kit for migrations and Drizzle Studio for inspection
- JWT auth: `jose` for sign/verify, `bcryptjs` for password hashing, httpOnly cookie
- Tailwind CSS 3 (utility-first, no inline styles, no CSS-in-JS)
- Zod 4 for all request/response/config validation
- ESLint 9 flat config

Do **not** introduce new top-level dependencies without flagging it explicitly and explaining why an existing tool can't do the job.

---

## 4. Architectural rules (non-negotiable)

### 4.1 Master-driven
Anything that varies between deployments or could change at runtime lives in a `master_*` table. Code reads master tables, it does not embed their values.

Examples:
- Status codes → `master_status`
- Document types → `master_document_type`
- Approval levels → `master_approval_hierarchy`
- Field validations → `master_field_validation`
- License types (IB / Export) → `master_license_type`
- Tracking templates → `master_tracking_template`
- Tax / duty rules used by Fiche de Calcul → `master_tax_rule_t`

### 4.2 Rule engine over `if/else`
For any decision involving more than 2 conditions or any condition a user might want to change, route it through the rule engine (`src/engine/rules/`). Rules are stored as JSON in `master_rules` and evaluated by `evaluateRule(ruleId, context)`. Never inline business rules in route handlers.

### 4.3 Template-driven modules
New "case types" (license, tracking run, invoice, credit note, payment request, …) are created by inserting a template row in `master_case_template`, not by adding a new module folder. The generic case runtime in `src/modules/case-runtime/` reads the template and renders forms, runs validations, executes workflow.

### 4.4 API-first
Every feature ships as a documented API route under `src/app/api/v1/` before any UI is built. Zod schemas double as the OpenAPI source (`@asteasolutions/zod-to-openapi`). Response envelope is always:

```ts
{ ok: true,  data: T, meta?: {...} }
{ ok: false, error: { code, message, details? } }
```

### 4.5 Dynamic forms & fields
UI forms are generated from `master_form_definition` + `master_form_field`. Never hand-code a form unless it is itself a master configuration screen.

### 4.6 Configurable workflow
Workflow transitions live in `master_workflow` + `master_workflow_transition`. Approvals (including the multi-stage **Payment Request** chain), notifications, and side effects are attached as actions on transitions, not coded into handlers.

### 4.7 Centralized validation & permission
- Validation: every input goes through a Zod schema. Schemas live in `src/schemas/`. No ad-hoc `if (!x) throw …` in handlers.
- Permission: every protected route calls `checkPermission(user, resource, action)` from `src/lib/auth/permissions.ts`. Permissions are stored in `master_permission` mapped to roles. Never check role names directly (`if (user.role === "admin")` is forbidden).

### 4.8 Reusable components
UI components in `src/components/` are pure and config-driven. Module-specific composition lives in `src/modules/<module>/`. If you're about to copy a component, refactor instead.

### 4.9 List pages — search & pagination
**Every page that renders a table of rows must have a search box and a pagination footer.** No exceptions for "it's only a few rows" — the table grows, and inconsistent UX between masters is worse than a footer on a 3-row table.

Two shared primitives drive this. Use them; do not hand-roll the state or the footer markup.

- **Hook**: [src/lib/hooks/usePagedList.ts](src/lib/hooks/usePagedList.ts) — `usePagedList(items, { initialPageSize? })`. Returns `{ page, setPage, pageSize, setPageSize, totalRows, totalPages, startIndex, paged, mounted, resetPage }`. Pure client-side pagination over an already-filtered array (callers do their own search with `useMemo`).
- **Footer**: [src/components/ui/PaginationFooter.tsx](src/components/ui/PaginationFooter.tsx) — renders rows-per-page selector, "Showing X–Y of Z", and first/prev/next/last buttons. Gates itself on `mounted` to avoid SSR hydration mismatch.

**Required elements on every list page:**
1. Search `<input>` above the table with a `<Search />` icon — placeholder lists the fields searched (e.g. `"Search name, url, parent..."`). Search handler calls `resetPage()` so a fresh filter starts on page 1.
2. Serial-number `#` column as the first table column, computed from `startIndex + idx + 1`. **Do not show the raw DB `id`** in this column — it leaks primary keys and changes meaning when filters are applied.
3. `<PaginationFooter />` at the bottom of the card, outside the `overflow-x-auto` table wrapper.

**Client-side vs server-side pagination:**
- **Client-side** (default — full list fits in one fetch): use `usePagedList(filtered)`. The hook handles everything. Reference: [src/app/masters/menu/page.tsx](src/app/masters/menu/page.tsx).
- **Server-side** (large tables, e.g. users / transactions): keep your own `page` / `pageSize` / `total` / `mounted` state and call `<PaginationFooter />` directly. The API endpoint accepts `?page=&pageSize=&q=`, returns `{ items, total, page, pageSize }`. Reference: [src/app/masters/users/page.tsx](src/app/masters/users/page.tsx).

**Picking server vs client:** if a `SELECT count(*)` over the unfiltered list could exceed ~500 rows, go server-side. Otherwise client-side keeps the UI snappier (no round trip on every filter keystroke).

`PAGE_SIZE_OPTIONS` is exported from the hook file. Don't redefine it locally — that's how the options drift apart across pages.

For **editable matrices** (e.g. [src/app/mapping/roletomenu/page.tsx](src/app/mapping/roletomenu/page.tsx)) where the user toggles cells across pages and saves at the end: keep the full edited state in a single `rows` array; let pagination/search slice only the *displayed* view. The save payload always sends the entire `rows` array, regardless of what's currently filtered or paged. Column-header "select all" checkboxes should scope to the **filtered** set, not the paged set, so a user can scope a bulk toggle with the search box.

### 4.10 Audit logging — every user-initiated change is recorded
Every create / update / delete / state-transition performed by a user must be persisted to a dedicated **audit table**, not to a log file. A database table is the source of truth because it is queryable, joinable with `users` and the affected entity, survives across instances/serverless cold-starts, and can be surfaced in admin UI and reports. Application log files are for diagnostics, not for accountability.

**Table:** `audit_log_t` (single global table; do not create per-module variants).

**Required columns (minimum):**
- `id` — uuid PK
- `actor_id` — FK to `users.id` (the user who performed the action; nullable only for system jobs, in which case set `actor_type = 'system'`)
- `actor_type` — enum: `user` | `system` | `api`
- `action` — enum: `create` | `update` | `delete` | `transition` | `login` | `logout` | `permission_change`
- `entity_type` — table/resource name (e.g. `master_status`, `license`, `invoice`)
- `entity_id` — uuid/text of the affected row
- `before` — `jsonb`, the row snapshot before the change (null for `create`)
- `after` — `jsonb`, the row snapshot after the change (null for `delete`)
- `diff` — `jsonb`, optional computed field-level diff for fast rendering
- `metadata` — `jsonb` (request id, IP, user agent, workflow transition id, reason text, etc.)
- `created_at` — `timestamp with time zone`, default `now()`

**Rules:**
1. **Never write to `audit_log_t` from the UI or from a route handler directly.** Writes go through `src/lib/audit/recordAudit.ts` (a single helper) so the shape stays consistent.
2. Audit writes happen **inside the same Drizzle transaction** as the change they describe — if the business write rolls back, the audit row must roll back too. No fire-and-forget.
3. `audit_log_t` is **append-only**. No `UPDATE` or `DELETE` against it from application code. Corrections are new rows with `action = 'update'` referencing the prior row in `metadata.corrects`.
4. For **master table edits** and **workflow transitions**, recording is mandatory. For high-volume read endpoints, do not audit reads — use application logs for that.
5. Sensitive fields (password hashes, tokens, secrets) must be **redacted** in `before` / `after` before insertion. The redaction list lives in `src/lib/audit/redact.ts`.
6. Retention and archival policy lives in a master table (`master_retention_policy`), not in code.
7. Surface audit history in admin UI via a generic `<AuditTrail entityType=… entityId=… />` component — do not hand-roll per-module audit views.

If you are about to write a route handler that mutates data and you are not calling `recordAudit(...)`, stop and add it.

### 4.11 File storage — S3 only
All binary files (PDFs, images, scans, attachments, generated invoices, customs docs, signed licenses, anything that isn't a row in Postgres) live in **S3 or an S3-compatible object store** (AWS S3, Cloudflare R2, MinIO for local dev). The database stores **metadata and a reference**, never the bytes.

**Hard rules:**
1. **No filesystem writes** for user content. Do not write to `public/`, `uploads/`, `/tmp` (except as transient buffer in a single request), or any disk path. Serverless/multi-instance deploys lose those files.
2. **No `bytea` / blob columns** in Postgres for user content. Postgres holds the pointer (`bucket`, `key`, `mime`, `size`, `sha256`).
3. **One client.** All S3 access goes through `src/lib/storage/s3.ts` (configured `S3Client` from `@aws-sdk/client-s3`). No ad-hoc clients in route handlers.
4. **One helper module.** Upload, download, presign, delete, copy all go through `src/lib/storage/` (e.g. `presignUpload()`, `presignDownload()`, `deleteObject()`). Route handlers call these; they do not import the SDK directly.

**Files table:** every uploaded object is registered in `files`:
- `id` — uuid PK
- `bucket` — text
- `key` — text (S3 object key)
- `mime` — text
- `size` — bigint (bytes)
- `sha256` — text (computed server-side after upload completes)
- `original_name` — text (the filename the user uploaded)
- `uploader_id` — FK to `users.id`
- `entity_type` / `entity_id` — what this file is attached to (license, invoice, credit_note, …)
- `status` — enum: `pending` | `committed` | `quarantined` | `deleted`
- `created_at` — timestamptz

A row in `files` with `status = 'pending'` and no matching S3 object is acceptable for short windows (presign issued, upload not yet completed). A nightly job sweeps stale `pending` rows.

**Upload pattern (default):** server issues a **presigned PUT URL** (`presignUpload`), client uploads directly to S3, then calls a `POST /api/v1/files/:id/commit` to flip status to `committed`. The commit handler verifies the object exists, reads its size/mime/sha256, and records an `audit_log_t` entry (see 4.10). Do not proxy file bytes through the Next.js server unless there's a specific reason (e.g. server-side generation).

**Download pattern:** never expose raw S3 URLs. Always return a **presigned GET URL** with a short TTL (default 5 minutes) via `presignDownload(fileId, user)`. The presign helper checks `checkPermission(user, 'file', 'read')` and that the user can see the parent entity before signing.

**Bucket layout:** `{env}/{entity_type}/{entity_id}/{file_id}-{slug(original_name)}`. Never put user-controlled strings directly into the key path without slugging. The bucket name comes from env, never hardcoded.

**Validation:**
- Max size and allowed mime types come from `master_file_policy` (per `entity_type`), not from constants in code.
- The commit handler rejects files outside the policy and marks the row `quarantined`.
- Virus scanning is a transition hook (`master_workflow_transition.action = 'scan_file'`) — not inline in the upload route.

**Lifecycle:** retention and archival are configured on the **bucket** (S3 lifecycle rules), not in application code. Soft-deletes flip `files.status = 'deleted'` and let the lifecycle rule purge the object after the configured grace period.

**Env vars (required):** `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` (true for MinIO/R2). Local dev uses MinIO via docker-compose; the same code path runs against AWS in prod.

**Dependency note:** this adds `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` as new top-level deps. Per section 3 these are flagged here explicitly — no other S3 client should be introduced.

If you are about to accept a file upload and you are not calling `presignUpload(...)` (or are writing bytes to disk), stop and rewrite the route.

### 4.12 Custom transactional pages — accordions are the unit of composition, permission, and audit

Operational pages (anything that is **not** a master CRUD list) — quotation forms, license issuance, tracking updates, Fiche de Calcul, invoice creation, credit notes, payment requests, etc. — are built from **accordions**. The accordion is the only legal container for inputs on these pages. The same accordion definition drives layout, role-based visibility, and audit context — they are not three separate concerns.

**Required master tables** (read §4.5 and §4.10 first):

- `master_page_t` — registers each transactional page. Columns: `slug`, `title`, `route`, `display_order`, `display`. Slug is the URL key (e.g. `license-issuance`, `invoice-create`).
- `master_page_accordion_t` — accordions on a page. Columns: `page_id` (FK), `slug`, `title`, `display_order`, `display`. Slug is unique within the page.
- `master_page_accordion_role_t` — which roles can see / edit which accordion. Composite key `(accordion_id, role_id)`. `permission` column with values `view` | `edit` so a role can be granted read-only access to a section without being able to mutate it.
- `master_page_accordion_field_t` — inputs inside the accordion. Columns: `accordion_id` (FK), `name`, `label`, `field_type`, `required`, `validation_rule_id` (FK to `master_field_validation`), `display_order`, `display`. **Every field is owned by exactly one accordion.**

**Hard rules:**

1. **No inputs outside an accordion.** Every input on every transactional page is bound to a row in `master_page_accordion_field_t`. If a field doesn't fit any existing accordion, the answer is a new accordion row — never an exception in code.
2. **Visibility is master-driven, not code-driven.** Server-side rendering reads `master_page_accordion_role_t` joined with the current user's roles to decide which accordions to send to the client. The client must never receive accordions the user can't see (defense in depth — don't rely on client-side hide). `view` renders the accordion read-only; `edit` enables inputs and the save button. **Never check role names in the page component** — go through `checkPermission(user, 'page:<slug>:<accordion_slug>', 'view' | 'edit')` per §4.7.
3. **No backdoor "admin sees everything."** Super Admin and any other elevated role must be granted access via `master_page_accordion_role_t` rows like every other role. The audit trail and the visibility logic must agree.
4. **Audit is per-field, per-accordion.** Every input change on a transactional page records an `audit_log_t` row (per §4.10) with:
   - `entity_type = 'page:<page_slug>'`
   - `entity_id = <transaction_id>` (the consignment / license / invoice id)
   - `metadata.accordion = <accordion_slug>`
   - `metadata.field = <field_name>`

   The accordion slug is **mandatory** — it's what lets the audit UI reconstruct "who edited which section, and when."
5. **One save = one transaction = one batch of audit rows.** When a user clicks Save on an accordion, the API wraps all field writes and all `recordAudit(...)` calls in a single Drizzle transaction. Partial accordion saves are not allowed. If any field fails validation, the whole accordion save rolls back.
6. **Use the shared runtime component.** Render via `<TransactionalPage slug={...} entityId={...} />` from `src/components/transactional/`. It fetches the page definition + accordions + role-filtered fields + current entity values, and handles save + audit. **Do not hand-roll an accordion page** — copy-paste is how the rules drift.
7. **Server-side filtering is required.** The API endpoint that returns a transactional page's structure (`GET /api/v1/pages/:slug?entity_id=...`) must filter accordions and fields by the caller's roles before responding. The same endpoint is the source of truth for what the user can see; the client never decides this.

**File layout:**

```
src/
  app/
    (app)/
      pages/
        [slug]/
          [id]/
            page.tsx          # one-line shim that renders <TransactionalPage>
  components/
    transactional/
      TransactionalPage.tsx   # the runtime renderer
      Accordion.tsx           # one collapsible section
      FieldRenderer.tsx       # dispatches by field_type
  app/api/v1/pages/
    [slug]/
      route.ts                # GET structure + values for the page
    [slug]/[id]/
      route.ts                # save accordion (POST/PUT) — wraps audit
```

If you are about to write a transactional page and you are (a) hand-coding role checks, (b) adding inputs that aren't in `master_page_accordion_field_t`, (c) writing save logic that doesn't call `recordAudit(...)`, or (d) sending accordions to the client without a server-side role filter, **stop and follow this section**.

### 4.13 Back navigation — every page has a Back button

Every authenticated page in the app gets a Back button. **No exceptions** for the pages listed below; the inconsistency between "this page has back, that one doesn't" is worse than the visual cost of one extra control on a list page.

**Where it goes**

- One `<BackButton />` at the top of the page, before any title or toolbar.
- Implemented as a shared component at [src/components/ui/BackButton.tsx](src/components/ui/BackButton.tsx). Do not hand-roll an `<ArrowLeft />` + `<Link>` per page — copy-paste is how the rule drifts.

**Behavior**

- Default action: `router.back()` so the user lands exactly where they came from (sidebar click, prior search results, prior edit screen).
- Fallback: if `window.history.length <= 1` (the page was opened in a new tab, reached via a typed URL, or after a refresh that cleared the navigation stack), it navigates to a safe URL — default `/dashboard`.
- Override via prop only when the default fallback is wrong for the flow. Example: a "New X" form may want `fallback="/x"` so a refresh-then-back lands on the list, not the dashboard.

**Pages that DO NOT get a Back button**

- `/login` — there's nowhere meaningful to go back to before authenticating.
- `/dashboard` — the back-stop itself; a Back button here would either dead-end or send the user to login.
- `/` (the root redirector).

**If you are about to ship a new page and it does not import BackButton, stop and add it.**

---

## 5. Directory layout

```
src/
  app/
    (auth)/              login, logout pages
    (app)/               authenticated app shell
    api/v1/              versioned API routes
  components/            reusable UI primitives (no module logic)
  modules/
    user-management/     plug-and-play
    role-management/     plug-and-play
    menu-management/     plug-and-play
    case-runtime/        generic case engine
  engine/
    rules/               rule engine
    workflow/            workflow engine
    forms/               dynamic form renderer
    templates/           template loader
  db/
    schema/              Drizzle table definitions (one file per domain)
    schema/index.ts      re-exports all tables and relations
    queries/             reusable typed query helpers
    seed/                seed scripts for master tables
  lib/
    db.ts                Drizzle client + pg Pool
    auth/                jwt, password, permissions
    validation/          shared Zod helpers
    api/                 response envelope, error handling
    errors/              typed error classes
    audit/               recordAudit() + redact list (see 4.10)
    storage/             S3 client + presign / upload / download helpers (see 4.11)
  schemas/               Zod schemas (request/response/config)
drizzle/                 generated migration SQL (committed)
drizzle.config.ts        Drizzle Kit config
proxy.ts                 Next.js 16 route guard
```

When adding files, match this layout. If something doesn't fit, ask before inventing a new top-level folder.

---

## 6. Coding conventions

- **TypeScript:** `strict: true`. No `any` (use `unknown` + narrowing). No `as` casts except at parse boundaries with Zod.
- **Async:** every async function has an explicit return type.
- **Errors:** throw typed errors from `src/lib/errors/`. Route handlers wrap with `withErrorHandler()`.
- **DB:** use Drizzle for all database access. See section 7 for the rules. Never import `pg` directly outside `src/lib/db.ts`.
- **Naming:** `snake_case` in DB, `camelCase` in TS, `PascalCase` for components and types. Master tables prefixed `master_`. Drizzle table objects use `camelCase` matching the TS convention (`masterStatus`, not `master_status`) with the SQL name set explicitly: `pgTable("master_status_t", { ... })`.
- **Every DB table ends with `_t`.** No exceptions. `users` → `users_t`, `audit_log_t` → `audit_log_t`, `master_page_t` → `master_page_t`. The suffix lets a quick grep over migrations distinguish table identifiers from columns/functions/aliases, and prevents collisions with Postgres-reserved or common names (`user`, `order`, `group`, `role`). If you see a `pgTable("…", { ... })` literal without `_t`, that's a bug — fix it, rename in the schema file, and update the migration. Drizzle table object names in TS are unaffected (still `masterStatus`, not `masterStatusT`).
- **Comments:** explain *why*, not *what*. No noise comments (`// increment i`).
- **Files:** one default export per file, named the same as the file.

---

## 7. Drizzle rules

### 7.1 Schema definitions
Every table lives in `src/db/schema/<domain>.ts` and is re-exported from `src/db/schema/index.ts`. Relations are declared with `relations()` next to the table.

```ts
// src/db/schema/users.ts
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  roleId: uuid("role_id").references(() => roles.id).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
}));
```

### 7.2 Migrations
- All schema changes go through `drizzle-kit generate` → review the SQL → commit both the schema file and the generated `drizzle/*.sql`.
- Never `drizzle-kit push` against staging or production. `push` is for local prototyping only.
- Migrations are immutable once merged. Fix a bad migration with a new migration, never edit history.

### 7.3 Query patterns
- **Simple reads:** use the query builder (`db.select().from(...)`) or the relational API (`db.query.users.findMany({ with: { role: true } })`).
- **Dynamic queries** (rule engine, dynamic filters, master-driven WHERE clauses): use the `sql` template tag. Compose with `sql.join`, `sql.identifier`, and parameterized values. Never concatenate strings into SQL.
- **Hot paths** (auth check, permission check, menu fetch): use `.prepare()` and reuse the prepared statement.
- **Multi-statement writes:** wrap in `db.transaction(async (tx) => { ... })`. Pass `tx`, not `db`, to any helper called inside.

### 7.4 Reusable query helpers
If the same query (or close variants) shows up in two places, extract it to `src/db/queries/<domain>.ts` as a typed function. Route handlers should call query helpers, not assemble queries inline, once a query is non-trivial.

### 7.5 Type inference
Use Drizzle's inferred types (`typeof users.$inferSelect`, `typeof users.$inferInsert`) for internal types. Use Zod schemas for API boundary types. Don't duplicate.

### 7.6 No raw `pg`
The only file that may import from `pg` is `src/lib/db.ts`. Everywhere else uses the exported `db` instance. This keeps connection pooling, logging, and instrumentation centralized.

---

## 8. What to do before writing code

1. **Read the relevant module's `CLAUDE.md`** if one exists (e.g. `src/modules/user-management/CLAUDE.md`).
2. **Locate the stage in section 2.** Which step of the consignment lifecycle does this work belong to? Which master tables drive it?
3. **Search for existing patterns.** Grep for similar features before writing new ones. The answer is often "there's already a helper for that."
4. **Check if it should be a config.** Could this be a master table row instead of code? If yes, do that.
5. **Define the schema first** if new tables are needed — Drizzle schema, generate migration, review SQL.
6. **Write the Zod schema** for the API boundary. Then the route handler. Then the UI.
7. **Write the test.** Every API route needs at least one happy-path and one auth-failure test in `__tests__/`.

---

## 9. What to do at the end of a task

- Run `pnpm typecheck && pnpm lint && pnpm test` before declaring done.
- If you changed any Drizzle schema, run `pnpm db:generate` and commit the generated SQL.
- If you added a new master table, also add: schema file, migration, seed entry, admin CRUD screen (auto-generated via dynamic form), and an entry in `docs/masters.md`.
- If you added a new API route, regenerate the OpenAPI spec (`pnpm openapi`).
- Summarize changes in plain English at the end of the response, grouped by: schema changes, new APIs, new UI, new masters.

---

## 10. Things to refuse / push back on

- Requests to hardcode a status, role, document type, license type, or workflow step → propose a master table instead.
- Requests to hardcode tax/duty math in Fiche de Calcul → propose `master_tax_rule_t` + rule engine.
- Requests to add a feature flag in code → use `master_feature_toggle` instead.
- Requests to `if (user.email === "...")` or similar one-off logic → push back, propose a permission or rule.
- Requests to skip the Zod schema "just this once" → no.
- Requests to bypass the response envelope → no, unless it's a non-JSON response (file download, etc.).
- Requests to write raw `pg.query("...")` calls → no, use Drizzle's `sql` tag or query builder.
- Requests to edit an already-merged migration → no, write a new one.

If the user insists after pushback, comply but add a `// TODO(config): move to master_*` comment.

---

## 11. Commands

```bash
pnpm dev              # next dev
pnpm build            # next build
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint .
pnpm test             # vitest run
pnpm db:generate      # drizzle-kit generate (after schema changes)
pnpm db:migrate       # drizzle-kit migrate (apply pending migrations)
pnpm db:studio        # drizzle-kit studio (visual DB browser)
pnpm db:seed          # seed master tables
pnpm openapi          # regenerate openapi.json from Zod schemas
```

---

## 12. When in doubt

Ask. A short clarifying question is always better than 200 lines of code in the wrong direction. Especially ask before:
- adding a dependency
- creating a new top-level folder
- writing logic that *might* belong in a master table
- changing the response envelope, error format, or auth flow
- making a Drizzle schema change that would require data migration (not just structure)
