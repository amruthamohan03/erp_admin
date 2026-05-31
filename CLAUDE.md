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

The ERP follows a consignment from onboarding to payment. Every step below maps to a module driven by master configuration — license types, tracking templates, tax rules, invoice formats, and approval hierarchies all live in `_master_t` tables (see §6 for the naming convention).

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
- Zod 3 for all request/response/config validation (Zod 4 upgrade is a deferred migration — `@asteasolutions/zod-to-openapi` is pinned to v7 to match)
- ESLint 9 flat config

Do **not** introduce new top-level dependencies without flagging it explicitly and explaining why an existing tool can't do the job.

---

## 4. Architectural rules (non-negotiable)

### 4.1 Master-driven
Anything that varies between deployments or could change at runtime lives in a `_master_t` table. Code reads master tables, it does not embed their values.

Examples (see §6 for the suffix convention):
- Status codes → `status_master_t`
- Document types → `document_type_master_t`
- Approval levels → `approval_hierarchy_master_t`
- Field validations → `field_validation_master_t`
- License types (IB / Export) → `license_type_master_t`
- Tracking templates → `tracking_template_master_t`
- Tax / duty rules used by Fiche de Calcul → `tax_rule_master_t`

### 4.2 Rule engine over `if/else`
For any decision involving more than 2 conditions or any condition a user might want to change, route it through the rule engine (`src/engine/rules/`). Rules are stored as [JSON Logic](https://jsonlogic.com) expressions in `rule_master_t.rule_json` and evaluated by `evaluateRule(ruleKey, context)` (or `applyRule(ruleJson, context)` when the expression is already in hand). Never inline business rules in route handlers.

### 4.3 Template-driven modules
New "case types" (license, tracking run, invoice, credit note, payment request, …) are created by inserting a template row in `case_template_master_t`, not by adding a new module folder. The generic case runtime in `src/modules/case-runtime/` reads the template and renders forms, runs validations, executes workflow.

Two entry points today:
- `createCase({ templateKey, actorUserId, values })` — inserts a row in `template.target_table` with `state = workflow.initial_state`. Field validation against the form definition is the caller's responsibility until §4.5 picks `validation_json`.
- `advanceCase({ templateKey, caseId, transitionKey, actorUserId, payload })` — reads the entity, calls `executeTransition` (rule gate + actions), validates `from_state` matches the entity's current state, and splices `patch + state + audit` into one UPDATE. Returns `sideEffects` (notify descriptors) for the caller to dispatch after the transaction commits.

Both use Drizzle's `sql` tag with `sql.identifier` for the dynamic `target_table` (§7.6 — no raw `pg`) and wrap multi-statement work in `db.transaction` (§7.3).

### 4.4 API-first
Every feature ships as a documented API route under `src/app/api/v1/` before any UI is built. Zod schemas double as the OpenAPI source (`@asteasolutions/zod-to-openapi`). Response envelope is always:

```ts
{ ok: true,  data: T, meta?: {...} }
{ ok: false, error: { code, message, details? } }
```

### 4.5 Dynamic forms & fields
UI forms are generated from `form_definition_master_t` + `form_field_master_t`. Never hand-code a form unless it is itself a master configuration screen.

`validation_json` on each field is a small token bag — `{ required?, min?, max?, pattern?, enum? }` — interpreted per `field_type`. `min`/`max` are length limits for strings and numeric bounds for numbers; `pattern` is a regex for string types; `enum` restricts allowed values (useful for select/hidden when `options_json` already drives the UI). `buildFieldZodSchema` / `buildFormZodSchema` in [src/engine/forms/validation.ts](src/engine/forms/validation.ts) compose these into Zod schemas — `createCase` uses the form schema to validate input before any INSERT.

Cross-field validation isn't handled by `validation_json` — wire those through the rule engine (§4.2) as a separate rule attached to the form definition.

React renderer: `<DynamicForm>` in [src/engine/forms/DynamicForm.tsx](src/engine/forms/DynamicForm.tsx) maps each supported `field_type` to a UI primitive (Input/Textarea/Switch/SearchableSelect) and runs `buildFormZodSchema` client-side before submit. Server `createCase` re-validates with the same schema — single source of truth on both sides.

### 4.6 Configurable workflow
Workflow transitions live in `workflow_master_t` + `workflow_transition_master_t`. Approvals (including the multi-stage **Payment Request** chain), notifications, and side effects are attached as actions on transitions, not coded into handlers.

`action_json` is an ordered array of typed actions, validated by Zod (`src/engine/workflow/actions.ts`):
- `{ "type": "set_field", "field": "approved_by", "value": { "var": "actor.userId" } }` — patches a field on the entity; `value` is a JSON Logic expression (or literal) evaluated against the rule context.
- `{ "type": "notify", "channel": "email" | "sms" | "in_app", "to": { "var": "entity.email" }, "template": "license_approved" }` — declarative recipient/template; not dispatched by the engine. `executeTransition` returns it under `sideEffects` and the caller (case-runtime) decides when to send (after the UPDATE commits).

`executeTransition(workflowKey, transitionKey, context)` returns an `ExecutedTransition` plan (`{ toState, patch, sideEffects, actions }`) instead of writing — case-runtime owns the target_table and is the right layer to splice the patch + new state into a single dynamic UPDATE via Drizzle's `sql` tag.

### 4.7 Centralized validation & permission
- Validation: every input goes through a Zod schema. Schemas live in `src/schemas/`. No ad-hoc `if (!x) throw …` in handlers.
- Permission: every protected route calls `checkPermission(user, resource, action)` from `src/lib/auth/permissions.ts`. Permissions are stored in `role_menu_mapping_t` (role × menu × `can_*` flags) — resources are menu URLs, actions are the five `can_*` columns. Never check role names directly (`if (user.role === "admin")` is forbidden).

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

---

## 5. Directory layout

```
src/
  app/
    (auth)/              login page
    (app)/               authenticated app shell + admin screens
    api/v1/              versioned API routes
  components/            reusable UI primitives (no module logic)
  modules/
    user-management/     plug-and-play
    role-management/     plug-and-play
    menu-management/     plug-and-play
    case-runtime/        generic case engine (template-driven)
    masters/             cross-cutting masters notes (see its CLAUDE.md)
  engine/
    rules/               rule engine — loadRule, evaluateRule (scaffold)
    workflow/            workflow engine — loadWorkflow, listTransitions,
                         executeTransition (scaffold)
    forms/               dynamic form renderer — loadForm (scaffold)
    templates/           case-template loader — loadTemplate
  db/
    schema/              Drizzle table definitions (one file per domain)
    schema/index.ts      re-exports all tables and relations
    queries/             reusable typed query helpers
    seed/                seed scripts for master tables
  lib/
    db.ts                Drizzle client + pg Pool
    auth/                jwt, password, permissions (incl. checkPermission)
    validation/          shared Zod helpers
    api/                 response envelope, requireAuth, withErrorHandler
    errors/              typed error classes
    hooks/               shared React hooks (usePagedList, …)
    openapi.ts           OpenAPI document generator
    storage.ts           file-upload validation + write
    translate.ts         translation provider integration
  schemas/               Zod schemas (request/response/config)
  proxy.ts               Next.js 16 route guard (must live under src/
                         when the project uses a src directory)
drizzle/                 generated migration SQL (committed)
drizzle.config.ts        Drizzle Kit config
openapi.json             generated by `npm run openapi` — do not hand-edit
scripts/                 dev tooling — seed-admin.js, generate-openapi.ts
docs/                    project-wide docs (e.g. masters.md table index)
```

When adding files, match this layout. If something doesn't fit, ask before inventing a new top-level folder.

---

## 6. Coding conventions

- **TypeScript:** `strict: true`. No `any` (use `unknown` + narrowing). No `as` casts except at parse boundaries with Zod.
- **Async:** every async function has an explicit return type.
- **Errors:** throw typed errors from `src/lib/errors/`. Route handlers wrap with `withErrorHandler()`.
- **DB:** use Drizzle for all database access. See section 7 for the rules. Never import `pg` directly outside `src/lib/db.ts`.
- **Naming:** `snake_case` in DB, `camelCase` in TS, `PascalCase` for components and types. Master tables use a `_master_t` suffix (e.g. `status_master_t`, `role_master_t`, `menu_master_t`). Drizzle table objects use `camelCase` (`statusMaster`, not `status_master_t`) with the SQL name set explicitly: `pgTable("status_master_t", { ... })`.
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

- Requests to hardcode a status, role, document type, license type, or workflow step → propose a master table (e.g. `status_master_t`) instead.
- Requests to hardcode tax/duty math in Fiche de Calcul → propose `tax_rule_master_t` + rule engine.
- Requests to add a feature flag in code → use `feature_toggle_master_t` instead.
- Requests to `if (user.email === "...")` or similar one-off logic → push back, propose a permission or rule.
- Requests to skip the Zod schema "just this once" → no.
- Requests to bypass the response envelope → no, unless it's a non-JSON response (file download, etc.).
- Requests to write raw `pg.query("...")` calls → no, use Drizzle's `sql` tag or query builder.
- Requests to edit an already-merged migration → no, write a new one.

If the user insists after pushback, comply but add a `// TODO(config): move to <name>_master_t` comment.

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
