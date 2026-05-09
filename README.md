# Admin Dashboard — Next.js 16 + PostgreSQL

Admin dashboard with JWT auth, role-based user management, and CRUD scaffolding for `users_t` and `role_master_t`.

## Stack

- **Next.js 16** (App Router, Turbopack, `proxy.ts` for route guards)
- **React 19** + **TypeScript 5.7**
- **PostgreSQL** via `pg` connection pool
- **JWT auth** (`jose` + `bcryptjs`) with httpOnly cookie
- **Tailwind CSS 3** for UI
- **Zod** for request validation
- **ESLint 9** (flat config)

## Prerequisites

- Node.js 18.17+ (you have 22.x — perfect)
- PostgreSQL 12+
- npm 9+

---

## Setup — step by step

### 1. Install dependencies

```bash
npm install
```

The project includes a `.npmrc` with `legacy-peer-deps=true`, so it'll handle Next 16's ESLint peer-dependency conflicts automatically.

### 2. Configure environment

`.env.local` is included with sensible defaults. **Edit it** if your PostgreSQL credentials are different:

```env
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_password_here
PGDATABASE=admin_dashboard

JWT_SECRET=generate-a-random-32-char-string
```

Generate a secret in PowerShell:
```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

### 3. Create the database

In PowerShell:

```powershell
psql -U postgres -c "CREATE DATABASE admin_dashboard;"
```

If `psql` is not in your PATH, use the full path:
```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "CREATE DATABASE admin_dashboard;"
```

### 4. Run the schema

```powershell
psql -U postgres -d admin_dashboard -f sql/01_schema.sql
```

This creates both tables, all indexes, and seeds the 4 default roles (Super Admin, Admin, Manager, User).

### 5. Seed the admin user

```bash
npm run seed
```

This generates a fresh bcrypt hash on **your** machine (so there's no version mismatch) and creates the admin user. Output:

```
[seed] generated bcrypt hash
[seed] admin user created with id=1

Login credentials:
  username: admin
  password: Admin@123
```

Re-running `npm run seed` resets the admin password — handy if you ever forget it.

### 6. Start the dev server

```bash
npm run dev
```

Open http://localhost:3000 — you'll be redirected to login. Use `admin` / `Admin@123`.

---

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/        # login, logout, me
│   │   ├── users/       # list, create, [id] CRUD
│   │   └── roles/       # list, create, [id] CRUD
│   ├── login/           # login page
│   ├── dashboard/       # dashboard home
│   ├── users/           # users management UI
│   ├── roles/           # roles management UI
│   ├── layout.tsx
│   ├── page.tsx         # redirects to /dashboard
│   └── globals.css
├── components/layout/   # Sidebar, Topbar, DashboardShell
├── lib/                 # db.ts, auth.ts, api.ts
├── types/               # shared TS types
└── proxy.ts             # Next 16 route protection (was middleware.ts)
sql/
└── 01_schema.sql        # tables + indexes + role seed
scripts/
└── seed-admin.js        # creates/resets the admin user
```

## API reference

All endpoints require auth except `/api/auth/login`. All responses follow `{ success, data?, message? }`.

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Authenticate, sets cookie |
| POST | `/api/auth/logout` | Clear cookie |
| GET | `/api/auth/me` | Current user info |
| GET | `/api/users?q=&page=&pageSize=` | List users (paginated) |
| POST | `/api/users` | Create user |
| GET | `/api/users/[id]` | Get user |
| PUT | `/api/users/[id]` | Update user |
| DELETE | `/api/users/[id]` | Soft-delete (display='N') |
| GET | `/api/roles` | List active roles |
| POST | `/api/roles` | Create role |
| GET | `/api/roles/[id]` | Get role |
| PUT | `/api/roles/[id]` | Update role |
| DELETE | `/api/roles/[id]` | Soft-delete (rejects if in use) |

## Default seed

| Role | Parent | Approval | Dept | Mgmt | Finance |
|------|:-:|:-:|:-:|:-:|:-:|
| Super Admin | — | 99 | ✓ | ✓ | ✓ |
| Admin | Super Admin | 50 | ✓ | ✓ | — |
| Manager | Admin | 20 | ✓ | ✓ | — |
| User | Admin | 1 | — | — | — |

Default admin: `admin` / `Admin@123` (Super Admin)

## Common issues

**Login says "Invalid credentials"** → run `npm run seed` to reset the admin password with a fresh bcrypt hash.

**Dashboard redirects back to login** → cookie wasn't attached. The login page uses `window.location.href` for hard navigation specifically to avoid this. Check DevTools → Application → Cookies to confirm `auth_token` is present.

**`database "admin_dashboard" does not exist`** → you skipped step 3.

**`psql: not recognized`** → PostgreSQL bin folder isn't on PATH. Use the full `C:\Program Files\PostgreSQL\<ver>\bin\psql.exe` path, or use pgAdmin's Query Tool to run the SQL files.

**ESLint peer-dep errors** → already handled by `.npmrc`. If you removed it, run with `npm install --legacy-peer-deps`.

## Notes

- **Soft deletes** — both tables use `display='Y'/'N'` per your schema.
- **Audit trail** — `created_by` / `updated_by` populated automatically from the JWT session.
- **Username & email** — unique constraints added in the schema.
- **Self-deletion blocked**, **role deletion blocked** while users hold it.

## Suggested next steps

1. File upload endpoints for `profile_image` / `signature_image`.
2. Permission gating per page based on role flags (`management`, `finance`).
3. Password reset flow + email integration.
4. Audit log table.
5. Departments and locations as proper master tables.
