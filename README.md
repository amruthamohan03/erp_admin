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
| `npm run seed`          | Seed initial admin user / roles / menus                               |
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

The engine subdirectories (`rules/`, `workflow/`, `forms/`, `case-runtime/`) currently expose scaffolds — load helpers work, but the runtime evaluators throw fail-loud until their respective formats (`rule_json`, `validation_json`, `action_json`) are decided. See CLAUDE.md §4.2 / §4.5 / §4.6 / §4.3.

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
