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
- Tax / duty rules used by Fiche de Calcul → `master_tax_rule`

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
- **Naming:** `snake_case` in DB, `camelCase` in TS, `PascalCase` for components and types. Master tables prefixed `master_`. Drizzle table objects use `camelCase` matching the TS convention (`masterStatus`, not `master_status`) with the SQL name set explicitly: `pgTable("master_status", { ... })`.
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
- Requests to hardcode tax/duty math in Fiche de Calcul → propose `master_tax_rule` + rule engine.
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
