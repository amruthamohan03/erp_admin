# ERP Admin

A customs clearance & logistics ERP for a DRC-based company. Manages the full life of an import/export consignment: **license → quotation → customs clearance → invoice → tax verification → credit note → payment → reporting**.

Built on a **metadata-driven architecture** — workflows, validations, forms, fields, permissions, templates, and approval chains live in master tables, not in source files.

> For the full design spec — architectural rules, naming conventions, what to refuse, etc. — read **[CLAUDE.md](CLAUDE.md)**. This README is just enough to get the project running.

---

## Stack

- **Next.js 16** (App Router, Turbopack, `src/proxy.ts` for route guards)
- **React 19** + **TypeScript** (strict mode)
- **PostgreSQL** via **Drizzle ORM** (`src/lib/db.ts`)
- **JWT auth** — `jose` for sign/verify, `bcryptjs` for password hashing, httpOnly cookie
- **Tailwind CSS 3**
- **Zod 3** for all request/response validation
- **vitest** for tests, **`@asteasolutions/zod-to-openapi`** (v7) for the OpenAPI spec

---

## Quick start

```bash
# 1. install deps
npm install

# 2. configure env
cp .env.example .env.local
#  → set PGHOST, PGUSER, PGPASSWORD, PGDATABASE, and a real JWT_SECRET

# 3. apply migrations (the SQL is in drizzle/, generated from src/db/schema/)
npm run db:migrate

# 4. seed the admin user
npm run seed

# 5. run dev
npm run dev
#  → http://localhost:3000
#  → default login: admin / Admin@123 (change the JWT_SECRET in prod!)
```

---

## Commands

| Command                 | What it does                                                          |
| ----------------------- | --------------------------------------------------------------------- |
| `npm run dev`           | Next dev server                                                       |
| `npm run build`         | Production build                                                      |
| `npm run typecheck`     | `tsc --noEmit`                                                        |
| `npm run lint`          | ESLint (Next config)                                                  |
| `npm run test`          | Run the vitest suite once                                             |
| `npm run test:watch`    | Vitest in watch mode                                                  |
| `npm run db:generate`   | Generate a Drizzle migration after editing `src/db/schema/*`           |
| `npm run db:migrate`    | Apply pending migrations                                              |
| `npm run db:studio`     | Open Drizzle Studio                                                   |
| `npm run db:introspect` | Reverse-engineer schema from an existing DB                           |
| `npm run db:seed`       | Seed master tables (license + invoice modules, field validations, …)  |
| `npm run seed`          | Bootstrap the admin user                                              |
| `npm run dispatch:notifications` | Drain the notification outbox via configured channels (console by default) |
| `npm run openapi`       | Regenerate `openapi.json` from the centralized Zod schemas             |

---

## Project layout

```
src/
  app/
    (auth)/              login page
    (app)/               authenticated app shell + admin screens
    api/v1/              versioned API routes
  components/            reusable UI primitives
  modules/
    user-management/     plug-and-play
    role-management/     plug-and-play
    menu-management/     plug-and-play
    case-runtime/        generic case engine (template-driven)
  engine/
    rules/               rule engine (rule_master_t)
    workflow/            workflow engine (workflow_master_t + transitions)
    forms/               dynamic form renderer (form_*_master_t)
    templates/           case template loader
  db/
    schema/              Drizzle tables, one file per domain
    queries/             reusable typed query helpers
    seed/                seed scripts for master tables
  lib/
    db.ts                Drizzle client + pg Pool
    auth/                jwt, password, permissions
    api/                 response envelope + withErrorHandler
    errors/              typed error classes
    openapi.ts           OpenAPI document generator
  schemas/               Zod schemas (request/response/config)
drizzle/                 generated migration SQL (committed)
openapi.json             auto-generated, do not hand-edit
scripts/
  generate-openapi.ts    backs `npm run openapi`
  seed-admin.js          backs `npm run seed`
src/proxy.ts             Next.js 16 route guard
```

The §4 engines are all live:

- **`engine/rules/`** — `applyRule` / `evaluateRule` / `loadTaxRule` / `evaluateTaxRule` run JSON Logic expressions against a context (`{ entity, actor, payload, now }`). `tax_rule_master_t` carries effective-date metadata for Fiche de Calcul.
- **`engine/workflow/`** — `executeTransition` returns a plan `{ toState, patch, sideEffects, actions }`. Rule gates use `applyRule`; actions parse from a typed Zod discriminated union (`set_field`, `notify`).
- **`engine/forms/`** — `loadForm` resolves `form_field_master_t.validation_json.validationKey` against `field_validation_master_t` so admins can reference shared regexes by stable key. `<DynamicForm>` (`src/engine/forms/DynamicForm.tsx`) is the React renderer.
- **`modules/case-runtime/`** — `createCase` / `readCase` / `listCases` / `advanceCase` orchestrate the full lifecycle against any `case_template_master_t` row. Writes to the dynamic `target_table` via Drizzle's `sql` tag (no raw `pg`). `advanceCase` enqueues `notify` side effects into `notification_outbox_t` in the same transaction as the UPDATE — classic outbox.

### What ships today

Two end-to-end domain modules drive `case-runtime` from real master data — both reachable via the sidebar:

- **Licenses** (`/licenses` · §2 step 2) — `license_create` form, 7-transition `license_default` workflow with `license.no_self_approve` rule gate, `set_field` actions populating `approved_by` / `approved_at`.
- **Invoices** (`/invoices` · §2 step 4) — `invoice_create` form (currency validated via `iso.currency_code`), 7-transition workflow with `set_field` actions for `issue_date` / `paid_at`.

Both run on the same generic API routes (`/api/v1/cases/{templateKey}/...`) and the same `<DynamicForm>` renderer. Adding a third module (credit note, payment request, …) is master data + a transactional table, not new engine code.

---

## Response envelope

Every API route returns one of these shapes (per CLAUDE.md §4.4):

```ts
// success
{ ok: true, data: T, meta?: { ... } }

// error
{ ok: false, error: { code, message, details? } }
```

`code` is one of: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VALIDATION_ERROR`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `INTERNAL_ERROR`.

Helpers are in `src/lib/api/`:

```ts
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { NotFoundError, ConflictError } from '@/lib/errors';

export const GET = withErrorHandler(async () => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  const user = await db.select()...;
  if (!user) throw new NotFoundError();
  return ok(user);
});
```

---

## OpenAPI

`npm run openapi` regenerates [`openapi.json`](openapi.json) from the Zod schemas in `src/schemas/` plus the endpoint annotations in `src/lib/openapi.ts`. Drop the file into any OpenAPI viewer (Swagger UI, Stoplight, etc.) to browse the API.

---

## Where to look next

- **[CLAUDE.md](CLAUDE.md)** — the full project spec. Read this before any non-trivial change.
- **[src/modules/masters/CLAUDE.md](src/modules/masters/CLAUDE.md)** — naming conventions and standard column set for `_master_t` tables.
- **[drizzle/](drizzle/)** — every migration SQL file, committed.
- **[openapi.json](openapi.json)** — the API contract.
