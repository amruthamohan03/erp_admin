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

React renderer: `<DynamicForm>` in [src/engine/forms/DynamicForm.tsx](src/engine/forms/DynamicForm.tsx) maps each supported `field_type` to a UI primitive (Input/Textarea/Toggle/SearchableSelect) and runs `buildFormZodSchema` client-side before submit. Server `createCase` re-validates with the same schema — single source of truth on both sides.

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

### 4.10 No redundant code; stay within the project structure
Two non-negotiable rules that apply to **every** change, not just new features:

1. **No redundant code, project-wide.** Before writing anything, search for an existing helper, hook, component, query, schema, or type that already does the job (grep first — §8.3). Reuse it. If two places need almost the same logic, extract one shared implementation and call it from both — never copy-paste-and-tweak. Don't add a second way to do a thing the codebase already does one way (fetching options, the response envelope, pagination, uniqueness checks, date formatting, the derive/conditions runtime, …). If the existing helper is *close* but not quite right, extend it (add a backward-compatible option) rather than forking a parallel copy. This generalizes §4.2 (rule engine over `if/else`), §4.8 (reusable components), and §7.4 (reusable query helpers) into one rule: **duplication is a defect — remove it, don't add it.**

2. **All changes stay within the existing structure.** Put new files where §5 says they go, extend the file that already owns a concern instead of creating a parallel one, and keep to the established patterns (response envelope §4.4, Zod at the boundary §4.7, Drizzle-only DB access §7, master-driven config §4.1). Do **not** invent new top-level folders, parallel utilities, alternate conventions, or one-off structures to route around what exists. If a change genuinely doesn't fit the current structure, **stop and ask** (§12) before inventing something new — a short question beats a divergent layout that the next task then has to reconcile.

When a task tempts you to duplicate or to step outside the structure, that is the signal to refactor the shared thing or extend the existing home for it — the fix lands in one place, and the whole project stays consistent.

### 4.11 Toggles, not checkboxes, for on/off state

**Anything that represents a boolean setting uses `<Toggle>` ([src/components/ui/Toggle.tsx](src/components/ui/Toggle.tsx)) — never `<input type="checkbox">`.** One control, one look, everywhere: active/inactive flags, `can_view`/`can_add`/… permission cells, visibility, "has TVA", "remember me", feature switches, and `field_type: 'checkbox'` in the dynamic form renderer. There is exactly one toggle component in the project — do not add a second one, and do not hand-roll a styled button that behaves like one.

```tsx
import Toggle from '@/components/ui/Toggle';

<Toggle checked={row.is_active} onChange={setActive} label="Active" />
<Toggle size="sm" checked={r.can_edit} onChange={...} aria-label={`Edit for ${r.menu_name}`} />
```

`Toggle` wraps `@radix-ui/react-switch`, so keyboard handling, focus and `role="switch"` come from the primitive rather than being reimplemented. It takes `checked` and `onChange(value: boolean)`, plus optional `label`, `size` (`'sm' | 'md'`), `disabled`, `id`, `title`, `className`, `aria-label`. **Inside a table cell, pass `aria-label`** — a bare switch in a grid is unnamed to a screen reader, and the column header alone does not name it.

**No exceptions — this includes selection.** Row selection, select-all headers, and multi-select option groups all use `<Toggle>` too. There are zero `<input type="checkbox">` elements in `src/`, and adding one is a defect. Two consequences to handle rather than route around:

- **A switch has no indeterminate state.** Where a select-all header used to render a half-checked box, show the count separately (`{n} selected` above the table, as [masters/seals/[id]](src/app/masters/seals/[id]/page.tsx) does) and let the header switch mean *all / not-all*.
- **Switches are wider than checkboxes** (28px at `size="sm"` vs 16px). Give the column room — `w-14` rather than `w-10` — instead of shrinking the control.

Radio buttons are unaffected — mutually exclusive choice is neither case; use a searchable dropdown (§4.16) or a radio group.

> §4.12–§4.14 are referenced throughout the codebase (`§4.12` = the metadata page runtime, `§4.13` = back-navigation, `§4.14` = field-level role grants) but have never been written up here. Numbers are reserved; do not reuse them for something else.

### 4.15 Clients are labelled by short code, everywhere

A client has two names: **`company_name`** — the full legal name, up to 200 chars — and **`short_name`**, the 3-character client code. **Every dropdown, filter, picker and option list shows `short_name`, never `company_name`.** It is what operators say out loud, it is what the reference formats embed, and a select full of 200-character legal names is unreadable and unscannable.

There is one resolver — [src/lib/clientOptions.ts](src/lib/clientOptions.ts). Do not re-derive the label at a call site:

```ts
import { clientOptionLabel, fetchClientOptions, CLIENT_OPTION_LABEL_FIELD } from '@/lib/clientOptions';

const clients = await fetchClientOptions();              // ready-to-render [{ value, label }]
<option key={c.id}>{clientOptionLabel(c)}</option>       // labelling rows you already hold
fetchOptions('clients', CLIENT_OPTION_LABEL_FIELD);      // page-local option fetchers
```

For **master-driven selects** this is config, not code: a `master_page_accordion_field_t` row with `options_source = 'clients'` must have `options_label_field = 'short_name'`. The seed ships that for all seven client selects, and migration `0046` normalises any row that drifted. If you add a client select through the page-builder, set the label field — don't special-case it in the renderer.

**This is about selection, not display.** Detail views, report columns, print/PDF output and export files still show `company_name` where the full legal name is the right thing — an invoice needs the legal entity, a dropdown needs the code. Some read-only tables sensibly show both (`{short_name} — {company_name}`); that's fine. The rule binds anything the user picks *from*.

### 4.16 Every dropdown is a searchable dropdown

**Pick-one lists use `<SearchableSelect>` ([src/components/ui/SearchableSelect.tsx](src/components/ui/SearchableSelect.tsx)) — never a raw `<select>`.** There are zero `<select>` elements in `src/`, and adding one is a defect. A native select gives no type-ahead past first-letter matching, which is unusable the moment a list passes a couple of dozen rows — and in this app clients, licenses, items, HS codes and users all do. One control everywhere also means one set of styles, one keyboard model, and one place to fix a bug.

```tsx
import SearchableSelect from '@/components/ui/SearchableSelect';

<SearchableSelect
  value={clientId}                       // always a string; convert at the boundary
  onChange={setClientId}                 // (value: string) => void
  options={clients.map((c) => ({ value: String(c.id), label: c.short_name }))}
  emptyLabel="All Clients"               // renders a clear/none row; omit for a required pick
  placeholder="All Clients"
  aria-label="Client"                    // required when there is no visible <label>
/>
```

Notes that catch people out:

- **`value` is a string.** A numeric id needs `String(id)` in and `Number(v)` out — a `number` silently never matches an option.
- **`emptyLabel` vs `placeholder`.** `emptyLabel` adds a selectable "none" row inside the list; `placeholder` is only the closed-state text. A filter usually wants both; a required field wants `placeholder` alone.
- **No `disabled` on individual options.** Withhold the option instead — see the seal status field, where "Damaged" is dropped rather than greyed out.
- **`size="sm"`** for inline filter bars and table footers; the default suits form fields.

Radio groups remain fine for two or three mutually exclusive choices rendered inline. Boolean on/off is a `<Toggle>` (§4.11), not a two-option dropdown.

**Every dropdown renders in id order, never alphabetically.** `orderOptions` in [src/lib/selectOptions.ts](src/lib/selectOptions.ts) is the one place that decides this, and `<SearchableSelect>` applies it to every list it is given. **Do not sort options at a call site** — a pre-sort is either redundant or it is fighting the rule.

```ts
// The component does this for you. Hand it the options in whatever order they arrived.
<SearchableSelect options={clients.map((c) => ({ value: String(c.id), label: c.short_name }))} … />
```

The rule has two branches, decided once per list rather than per comparison — a comparator that sorts some pairs and not others is inconsistent, and the result of an inconsistent comparator is undefined:

- **Every value is numeric** → ascending id. An entity-backed dropdown carries the row id as its `value`, so this is creation order: the order operators already know a master by, and the order the master's own screen lists it in.
- **Anything else** (status codes, `'Y'`/`'N'`, workflow stages) → the supplied order, untouched. There is no id to sort by, and that order is authored — usually a meaningful sequence.

Alphabetical order was wrong for both. For entity lists it made the picker unstable: adding a client called "AAA Depot" moved every other option down, so a dropdown an operator had learned by position changed under them for reasons unrelated to their work. For authored lists it destroyed a deliberate sequence — a workflow's stages came back as Approved, Draft, Paid.

Two consequences to respect:

- **The order comes from the endpoint, so the endpoint's `ORDER BY` matters.** It does not have to be ascending — the component re-orders — but a source that cannot supply ids (a computed or grouped list) will render in whatever order it arrives.
- **A master with its own ordering column is not covered by this.** No `options_source` currently points at a table carrying `display_order` / `sort_order`. If one is added, that column is the intended order and `orderOptions` would override it — extend the shared helper to honour it rather than sorting at the call site.

Fetching options is shared too: `fetchMasterOptions(source, labelField)` from the same module handles the `pageSize=100` cap and both response envelope shapes. Three list pages each carried a byte-identical private copy and two of them missed the paginated shape, so the same dropdown was populated on one screen and empty on another (§4.10).

### 4.17 One save per transaction page, not one per accordion

**A transaction page has exactly one Save button, in a sticky action bar at the bottom.** Accordions are a way to *organise a long form*, not separate records — an operator filling a consignment thinks in terms of "save this consignment", not "save Basic, then save Contact, then save Legal". Per-section save buttons also meant a half-filled entity could sit in the database between clicks, and any cross-section validation rule saw stale values for the sections that hadn't been saved yet.

The pieces:

- **[TransactionalPage](src/components/transactional/TransactionalPage.tsx)** owns the form: the values, which accordions are open, the resolved field states (§4.12 conditions), save/dirty/error state, and the single Save.
- **[Accordion](src/components/transactional/Accordion.tsx)** is presentational. It renders fields and reports toggles. **It must not own a save button, a save handler, or any save state.** Adding one back is a defect.
- **`POST /api/v1/pages/{slug}/{id}`** accepts every editable section in one request and commits them in **one transaction**:

```jsonc
{ "accordions": [ { "slug": "basic", "values": {…} }, { "slug": "contact", "values": {…} } ] }
```

The single-accordion shape (`{ accordion_slug, values }`) is still accepted for API-only callers, but the UI never uses it.

Three consequences worth knowing before you touch this:

1. **Each accordion's values are whitelisted against its own field list.** A field cannot be written through an accordion that doesn't own it — don't "simplify" the route by merging all values into one bag before the permission check.
2. **A create is a single INSERT carrying the whole form.** There is no "first accordion creates, the rest update" sequencing, and no half-written row when a later section fails validation.
3. **Every accordion is validated on every save**, so `required` is judged against the *resulting* value — patch first, then the merged context of stored row + submission. A required field that is legitimately absent from the patch (read-only, or derived) must not fail on that alone.

Because one Save covers sections the user may have collapsed, the page surfaces errors where they can be seen: a failed save opens the accordion holding the offending field, marks the field, and shows an error count on that section's header. Keep that behaviour if you rework the save flow.

### 4.18 Mandatory fields: red star on the label, red highlight when empty

**A required field carries a red star on its label, and highlights itself in red when it is required and empty.** Both come from shared CSS — never hand-roll either.

**The star.** Add `required` to the label's class. Do **not** type an asterisk into the label text:

```tsx
<label className="label required">Client</label>          // ✅ CSS renders the star
<label className="label">Client *</label>                 // ❌ drifts in glyph, colour, spacing
<label className="label">Client <span className="text-red-500">*</span></label>  // ❌ same
```

The rule is `label.required::after` in globals.css, matched on the element rather than on `.label`, so it also covers the Radix `<Label>` primitive used by [DynamicForm](src/engine/forms/DynamicForm.tsx). The star is generated content, so screen readers announce the control's own `required` attribute instead of stray punctuation.

**The highlight.** `.input:user-invalid` and `.input[aria-invalid="true"]` paint the destructive border and ring. Two paths feed it:

- **Native** — the control needs the `required` attribute. `:user-invalid` (not `:invalid`) is deliberate: the browser applies it only after the user has edited the control or attempted to submit, so a blank form doesn't open covered in red.
- **`aria-invalid`** — for a server-driven error (a failed save naming a field) and for controls that aren't native inputs.

**A star without `required` on the control is a defect** — it promises a check that can never fire. The two go together. Read-only and derived fields are the one exception: the constraint API exempts them, so they keep the star (the data *is* required) without the attribute.

**`<SearchableSelect>` needs its own handling** — the visible control is a `<button>`, which the browser never marks `:user-invalid`. It tracks engagement itself and sets `aria-invalid` once a `required` pick has been opened and dismissed without choosing; pass `invalid` to force it from outside.

For the metadata-driven pages this is config, not code: `master_page_accordion_field_t.required` drives both the star and the attribute through [Accordion](src/components/transactional/Accordion.tsx) and [FieldRenderer](src/components/transactional/FieldRenderer.tsx). Don't special-case a field in the renderer.

### 4.19 Dates display as day/month/year

**Every date a user reads renders `DD/MM/YYYY`**, through [src/lib/formatDate.ts](src/lib/formatDate.ts). Never hand-roll a date string and never call `toLocaleDateString()`.

```ts
import { formatDate, formatDateTime, toDateInputValue } from '@/lib/formatDate';

formatDate('2026-08-03')                 // '03/08/2026'
formatDate(null)                         // '—'   (NO_DATE; pass a second arg to override)
formatDateTime('2026-08-03T14:30:00Z')   // '03/08/2026 14:30'  — audit trails, activity feeds
toDateInputValue(row.expiry)             // '2026-08-03'  — for <input type="date">
```

Three things this exists to prevent, all of which were live in the codebase:

1. **Locale drift.** `toLocaleDateString()` follows the *machine's* regional settings, so the same row renders `03/08/2026` on one box and `08/03/2026` on another. For a customs operation that is a date being read as March instead of August. Formatting here is deliberately **not** locale-aware — the business format is fixed.
2. **Timezone shift.** `new Date('2026-01-01')` is UTC midnight, which renders as *31/12/2025* west of Greenwich. `formatDate` reads a `YYYY-MM-DD` string textually and only uses the `Date` API for real timestamps.
3. **Drift between screens.** Twelve local `fmtDate` helpers had produced five different formats. One implementation, one format.

**Display only.** Stored values, API payloads and query params stay ISO `YYYY-MM-DD` — that is what Postgres, Zod and the HTML date input all expect. `<input type="date">` must be fed `toDateInputValue()`, never `formatDate()`; a localised value renders the picker blank.

The one sanctioned exception is a **calendar tile** that stacks the day over an abbreviated month (see the holiday chips in [KpiDelayView](src/modules/kpi/KpiDelayView.tsx)). That is still day-before-month, so the rule's intent holds; pin the locale (`'en'`) and timezone explicitly.

### 4.20 Colour comes from tokens, and an action button is coloured by what it produces

**Never hardcode a text or border colour on a Tailwind palette class.** `text-slate-500`, `text-slate-400` and friends bypass the theme entirely: they are a fixed grey that cannot follow light/dark, cannot follow the operator's configured palette, and drift into a washed-out "light black" that is tiring to read. There are zero `text-slate-400` / `text-slate-500` classes in `src/`, and adding one is a defect.

Use the tokens in [globals.css](src/app/globals.css):

| Need | Token class |
| --- | --- |
| Body / labels / primary reading text | `text-foreground` |
| Secondary text — hints, table meta, counts | `text-muted-foreground` |
| Card edges, dividers, table rules | `border-border` |
| The border of an input the user types into | `border-input` |

Two of these are deliberately tuned rather than inherited, and both must stay that way:

- **`--foreground` is near-black, and `.label` uses it at full strength.** A field label is not secondary information. The old `text-foreground/80` was the single biggest source of the faded look on long forms.
- **`--input` is much darker than `--border`.** They are separate tokens precisely so they can differ: structural edges stay light so the page is not a grid of boxes, while a control the user is meant to type into announces where its edges are. In dark mode the same intent **inverts** — `--input` goes *lighter* than the surface, not darker. When changing one theme's value, change the other to match the intent, not the number.

**Action buttons are coloured by what they produce, not by the page they sit on.** Colour is a signal operators learn once; the same action must look the same everywhere. Use the shared classes — never hand-roll `inline-flex items-center gap-1.5 rounded-md bg-…` again:

```tsx
<button className="btn-pdf btn-sm">   <Printer /> Print / PDF </button>   {/* red   — produces a PDF */}
<button className="btn-excel btn-sm"> <FileSpreadsheet /> Export </button> {/* green — produces a spreadsheet */}
<button className="btn-neutral btn-sm"><Eye /> View </button>              {/* slate — produces nothing */}
<button className="btn-primary">Save</button>
<button className="btn-danger">Delete</button>
<button className="btn-secondary">Cancel</button>
```

`btn-sm` and `btn-icon` are size modifiers and carry no colour; put them **after** the colour class. `btn-icon` is the 28px square used in table action columns.

**Three row-action hues are reserved.** A table's action column is scanned, not read, so the same glyph must mean the same thing in the same colour on every screen:

| Action | Filled (solid buttons) | Bare (glyph-only tables) |
| --- | --- | --- |
| **View** — opens a read-only look | `btn-view btn-icon` — near-black | `ico-view` |
| **Edit** — opens the record for change | `btn-edit btn-icon` — blue | `ico-edit` |
| **Delete / disable** — destroys or hides | `btn-delete btn-icon` — red | `ico-delete` |

```tsx
<button onClick={() => setViewId(r.id)} title="View" className="btn-view btn-icon"><Eye className="h-3.5 w-3.5" /></button>
<Link href={`/imports/${r.id}`} title="Edit" className="btn-edit btn-icon"><Edit2 className="h-3.5 w-3.5" /></Link>
<button onClick={() => remove(r.id)} title="Delete" className="ico-delete ml-1"><Trash2 className="h-4 w-4" /></button>
```

Two consequences to respect:

- **Colour the icon at rest, not on hover.** The master screens used to render every action grey and only reveal the red on hover, which made the operator hunt for the most dangerous control in the row. `ico-delete` is red before the pointer arrives.
- **Never dress a non-destructive action in the delete hue.** "Mark DGI Verified" wore `bg-red-800` immediately beside the real Delete button; it now uses violet. Any other action — copy, manage, verify, toggle visibility — picks a hue **outside** the reserved three.

This rule exists because the same action had drifted across screens: "Export All to Excel" was emerald on the licence list, amber on the invoice list, sky on the client dashboard and grey when disabled; PDF was violet, rose *and* red within a single row of buttons; Delete was `bg-red-600` in one table and `bg-slate-500` in another. If a new action genuinely does not fit `pdf` / `excel` / `neutral` / `view` / `edit` / `delete` / `primary` / `danger`, add a class to globals.css — do not inline it at the call site.

### 4.21 Every modal has a labelled way out

**A modal's footer always carries a `Cancel` (or `Close`) button, in every mode — creating, editing, viewing and confirming alike.** An `X` in the corner and a click on the backdrop are not sufficient: both are unlabelled, neither is obvious on a touch screen, and a dialog that commits something (an approval, a rejection, a delete) must let the user leave without deciding through an explicit, labelled control.

```tsx
<div className="flex justify-end gap-2 border-t border-border px-5 py-3">
  <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
  <button type="submit" className="btn-primary">Save</button>
</div>
```

Rules that follow:

- **Never render the cancel conditionally.** `{!isEdit && <Cancel/>}` is a defect — editing is exactly when an escape route matters most, because the user has a half-changed record in front of them.
- `Cancel` for a form, `Close` for a read-only view. Both count; a bare `X` alone does not.
- Keep the `X` in the header as well — it is a convenience, not the primary control.
- The cancel stays enabled while a save is in flight unless cancelling is genuinely unsafe.

### 4.22 Every CRUD operation reports its outcome, and the user acknowledges it

**A create, update or delete always ends in [`<ResultDialog>`](src/components/ui/ResultDialog.tsx) — success or failure — and nothing moves until the user clicks OK.** There are zero `alert()` calls in `src/`, and adding one is a defect.

```tsx
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';

const [result, setResult] = useState<SaveResult | null>(null);

if (!json.ok) {
  setResult({ status: 'error', title: 'Not deleted', message: json.error?.message || 'This client could not be disabled.' });
  return;
}
setResult({ status: 'success', title: 'Deleted', message: 'The client has been disabled.' });
load();

// …and once, at the end of the component:
<ResultDialog result={result} onDismiss={() => setResult(null)} />
```

**OK is what navigates.** On a transaction page a successful save does *not* redirect on its own — it opens the dialog, and dismissing it is what takes the user to the list (§4.13 derives that route). A silent navigation is indistinguishable from the page changing by itself, and gives no confirmation that the record was actually written.

**Failure dismisses in place.** The form still holds the user's work and the offending field is already marked (§4.18), so closing the dialog must return them to it — never navigate away from unsaved input.

Rules that follow:

- **Never use `alert()` or `confirm()` for a result.** `alert()` is unstyled, unthemed, blocks the main thread and cannot show a field-level detail. (`confirm()` is still acceptable *before* a destructive action — that is a question, not a result.)
- **Say what happened to what.** "The client has been disabled" beats "Success". Take the noun from the thing being acted on.
- **Titles are outcomes, not statuses**: `Created`, `Saved`, `Deleted`, `Not saved`, `Not deleted`.
- **Pass the server's message through.** `json.error?.message` first, and only fall back to generic copy when the server said nothing useful.
- The dialog focuses its OK button on open, closes on Escape and on backdrop click, and carries a labelled button per §4.21.

This exists because the two prior patterns both failed the operator: master screens threw a native `alert('Failed')` that named neither the record nor the reason, while transaction pages silently redirected on success and dropped a line of red text into the action bar on failure — so a save that worked and a save that did nothing looked nearly identical.

### 4.23 A rejected input always says which field and why

**Every validation message names the thing that is wrong and what would make it right.** `"Invalid input"`, `"Save failed"`, `"Error"`, `"Bad request"` and a bare status code are all defects — they tell an operator that something is broken and leave them to find it by trial and error on a form with thirty fields.

A message that reaches a user has to answer three questions:

| Question | Bad | Good |
| --- | --- | --- |
| **Which field?** | `Invalid input` | `Tagline must be 255 characters or fewer.` |
| **What is wrong with it?** | `Validation failed` | `Favicon must be .ico, .png or .svg — this file is .bmp.` |
| **What do I do?** | `File too large` | `Logo is 3.4 MB — the limit is 1 MB. Choose a smaller file.` |

**One generator, used on both sides.** [src/lib/validation/messages.ts](src/lib/validation/messages.ts) turns a `ZodError` into `{ message, fields }` — a sentence for the dialog and per-field messages for the inputs. Do not write a second one, and do not hand-format a Zod issue at a call site.

- **Server** — `withErrorHandler` already runs every `ZodError` through `summarizeZodError`, so **a route gets this for free by throwing or parsing as usual**. The envelope carries the sentence as `error.message` and the per-field bag as `error.details.fields`. Postgres constraint failures that are really validation problems (22001 length, 22003 range, 22P02 format, 23502 not-null, 23514 check) map to a 422 with a named field too, instead of the 500 they used to produce.
- **Client** — `safeFetchJson` lifts `details.fields` into `res.fieldMessages` and the first offending path into `res.field`. Mark the input with `aria-invalid` and print its own sentence beneath it (§4.18), then report the outcome through `<ResultDialog>` (§4.22).
- **Before the round trip** — a page that already holds the request schema runs `schema.safeParse()` and formats the failure through the *same* `summarizeZodError`, so the wording an operator sees does not change depending on whether the check happened in the browser or on the server. `/settings/application` is the reference.

**Write the sentence in the schema, not in the handler.** Zod's defaults describe the type system (`Expected string, received null`); the generator rewrites the common ones into plain English, and an explicit message always wins:

```ts
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/u, 'Must be a 6-digit hex color (e.g. #2563eb)');
z.string().min(1).max(100)   // → "Project Name is required." / "Project Name must be 100 characters or fewer."
```

Rules that follow:

- **Name the field the way the user sees it.** Paths are humanized (`favicon_url` → `Favicon`), so a field whose key reads badly gets an explicit message rather than a special case in the renderer.
- **Quantities go in the message.** "3.4 MB, limit 1 MB" — not "too large". "at least 3 characters" — not "too short".
- **Never leak a raw error object into the UI.** A stringified `{"fieldErrors":{…}}`, a pg driver message, or a stack trace is not a validation message. `safeFetchJson` deliberately renders `details.fields` as prose and never prints the machine keys.
- **A 500 is not a validation outcome.** If a save is rejected because of what the user typed, it is a 4xx with a sentence. A "Server error" for a value that is three characters too long is a bug in the mapping, not in the input.
- **File uploads validate content, not the filename.** The browser's `File.type` is unreliable (a `.ico` arrives as `image/x-icon`, `image/vnd.microsoft.icon`, or `''` depending on the machine). [saveUploadedImage](src/lib/storage.ts) sniffs magic bytes, falls back to the extension only when the browser declared nothing, and names both the accepted formats and the rejected one. Pass `label` so the message says "Favicon", not "File".

### 4.24 An uploaded file is not saved until the row points at it

Branding assets, avatars, signatures and document attachments are **a file on disk plus a row that names it**. Neither half is the record. Two failure modes follow, and both have bitten this project:

1. **The row is written and the file is not.** `saveUploadedImage` stats the file after writing and throws if the byte count disagrees — a URL is only returned once the bytes are on disk.
2. **The file is written and the row is not.** Write the new URL *first*, and only delete the previous file after the UPDATE returns a row. The reverse order leaves the operator with no logo and a row naming a deleted file; this order orphans an upload instead, which is invisible and recoverable.

**A row can also outlive its file** — `public/uploads/` is not part of a database dump, so a restore carries the URL without the image. The server can tell (`uploadExists`), the browser cannot. Endpoints that serve an asset URL report it in `meta` (`logo_file_missing`), and the UI says *"the stored file is missing from the server, upload it again"* rather than rendering an empty box that claims to hold a logo.

**Anything an operator uploads must actually be rendered somewhere.** `favicon_url` was stored, deleted, replaced and validated for months while the root layout carried a hardcoded `metadata` — so the setting worked perfectly and changed nothing. When adding a configurable asset, wire the consumer in the same change.

**Uploads are served by a route handler, never by `public/`.** Next.js only serves files that were in `public/` *when the build ran*:

> Only assets that are in the public directory at build time will be served by Next.js. Files added at request time won't be available.

Every upload in this app is written at request time, so in a built deployment (`next build && next start`) all of them 404 — avatars, signatures, attachments and branding alike — while `next dev` serves them happily from disk. That split is the whole bug: it cannot be reproduced locally, and it presents as a *corrupt file* rather than a missing one, because the server correctly reports the bytes on disk while the browser's `<img>` receives an HTML 404 body and fires `onError`.

So `/uploads/:path*` is rewritten to [src/app/api/v1/uploads/[...path]/route.ts](src/app/api/v1/uploads/[...path]/route.ts) in `next.config.js`, under **`beforeFiles`** so the handler wins in dev too — identical behaviour in both is the point. Stored URLs are unchanged; nothing in the database moved.

Three things to keep if you touch this:

- **One containment check.** `resolveUploadPath` in [src/lib/storage.ts](src/lib/storage.ts) is the only place an untrusted path becomes a filesystem location, shared by the serving route, `uploadExists` and `deleteUploadIfLocal`. It rejects traversal, absolute paths, embedded NUL bytes, and sibling directories that merely share the root's prefix. Do not hand-roll a second `startsWith(UPLOADS_ROOT)` check.
- **Only known image types are served**, by extension — anything else on disk is a 404 rather than a guess.
- **An uploaded SVG is executable markup.** The response carries `Content-Security-Policy: default-src 'none'; … sandbox` and `X-Content-Type-Options: nosniff`, so a script inside an uploaded logo cannot run on this origin.

Access is unauthenticated, matching what `public/` gave before — the login screen renders the branding logo with no session. Narrowing the other buckets to a session is worth doing, but it also affects the server-side print/PDF builders, so it is a deliberate separate change rather than a side effect of this one.

**The app ships its own logo and favicon**, so a fresh install has an identity before anyone uploads anything. [BrandMark](src/components/ui/BrandMark.tsx) is the in-app mark and draws from `--brand-from` / `--brand-to`, so it follows the operator's configured palette (§4.20); [public/brand/erp-admin-mark.svg](public/brand/erp-admin-mark.svg) is its static twin with the default palette baked in, because a favicon file cannot read CSS variables. `src/app/{icon.svg,apple-icon.png,favicon.ico}` are generated from that file by `node scripts/generate-icons.js` and committed — regenerate and commit after editing the mark. Next's file conventions apply only when `generateMetadata` supplies no `icons`, which is exactly the layering wanted: an uploaded favicon wins, these are the default.

### 4.25 One DataTable for every list of records

**Every screen that lists records renders the same `<DataTable>`.** There are 66 list pages in this app and they were each hand-built, which is why search, pagination, action placement, empty states and loading states all drifted. A new list page must not hand-roll `<table>` markup.

The standard behaviour a list page gets for free, and must never re-implement:

| | |
| --- | --- |
| Search | above the table, placeholder naming the searched fields, resets to page 1 |
| Sorting | click a column header; the sorted column is marked |
| Filtering | declarative filter descriptors, rendered as `<SearchableSelect>` (§4.16) |
| Pagination | `usePagedList` + `<PaginationFooter>` (§4.9), with page-size selection |
| Row actions | View / Edit / Delete in the reserved hues (§4.20), in the LAST column, right-aligned |
| Excel export | `btn-excel` in the toolbar wherever the module has an export endpoint (§4.20) |
| Loading | skeleton rows, never a bare "Loading…" that collapses the layout |
| Empty state | a sentence naming what is missing and the action that fixes it — never just "No data" |
| Serial column | `#` from `startIndex + idx + 1`, never the raw primary key (§4.9) |
| Themes | light and dark, from tokens only (§4.20) |

Columns are declared as data, not markup, so every table shares one rendering path:

```tsx
<DataTable
  rows={items}
  loading={loading}
  columns={[
    { key: 'company_name', header: 'Company', sortable: true },
    { key: 'amount', header: 'Amount', align: 'right', render: (r) => money(r.amount) },
  ]}
  actions={(row) => ({ view: () => setViewId(row.id), edit: `/masters/clients/${row.id}` })}
  emptyMessage="No clients yet — create the first one."
/>
```

Do not add a prop for a one-off visual tweak on a single screen. If two pages genuinely need different behaviour, that is a signal the shared component needs a considered option, not that the page needs its own table.

### 4.26 Action colour and icon are configuration, not code

**The colour and icon of every action come from `action_style_master_t`, edited under Settings → Application.** An operator changes how Delete looks across the whole ERP with a row edit and a refresh — no deploy, no source change (§4.1).

The sixteen configured actions: `create`, `save`, `update`, `edit`, `view`, `delete`, `cancel`, `approve`, `reject`, `submit`, `export`, `import`, `download`, `print`, `restore`, `permanent_delete`.

Each row carries a hex colour and a [lucide](https://lucide.dev) icon name. The server turns them into CSS variables alongside the brand palette, and the `btn-*` / `ico-*` classes read those variables — so **every existing call site follows the configuration with no change**, because they already go through the shared classes rather than inlining a colour (§4.20).

```tsx
<ActionButton action="export" onClick={run}>Export</ActionButton>   {/* colour + icon from config */}
<ActionIcon action="delete" />                                      {/* just the glyph */}
```

Rules that follow:

- **One icon library.** Icon names are validated against the lucide set the app bundles; an unknown name falls back to that action's default rather than rendering nothing.
- **Defaults must be sensible on their own.** A fresh install looks right without anyone opening Settings: view near-black, edit blue, delete red, export green, approve green, reject red, print red.
- **Readable in both themes.** A configured hex is used as-is in light mode and lightened for dark; the settings screen previews the pair rather than letting an operator pick an unreadable one.
- **Never hardcode an action colour or icon again**, including "just this one screen". If an action is missing from the table, add the row — do not inline it.

### 4.27 Soft delete, restore, and permanent delete are three different things

**Normal deletion never removes a row.** 74 of the 85 tables already carry a `display` flag; deleting sets `display = 'N'` and nothing else. Lists show `display = 'Y'` by default.

| Operation | What it does | Permission |
| --- | --- | --- |
| Delete | `display = 'N'`, row kept in full | `can_delete` |
| Restore | `display = 'Y'` | `can_restore` |
| Permanent Delete | a real `DELETE`, last resort | `can_permanent_delete` |

- **Three separate permissions**, never one. A user who may hide a record is not thereby allowed to destroy it.
- **Permanent delete asks twice** — a confirmation naming the record, then a typed confirmation — and is the only path that may lose data.
- **A Recycle Bin screen** per module lists soft-deleted rows and offers Restore and, where permitted, Permanent Delete.
- **Soft-deleted rows stay readable to history.** A report over past months must still resolve the name of a deleted client.
- **Related rows are handled explicitly.** Deleting a parent must not orphan children silently — either cascade the soft delete or refuse with a message naming what still references it (§4.23).

### 4.28 What the audit log must capture

**Every consequential action is written to `audit_log` through `recordAudit`**, inside the same transaction as the change it describes (§7.3). Nothing writes that table directly.

Logged: login, logout, failed login, create, view, update, soft delete, restore, permanent delete, approve, reject, submit, cancel, export, import, download, print, status change, role change, permission change, user change, application-settings change.

Each entry captures, where applicable: actor id, actor role, module, action, record reference, timestamp, before value, after value, IP address, and user agent (device / browser). An update must carry a per-field **before → after** diff, not just two snapshots.

- **Read-only, always.** No UI edits an audit row, and none permanently deletes one.
- **Exporting the audit log is itself logged.**
- **Viewing audit logs is its own permission**, separate from exporting them.
- Secrets never reach the table — `redact` strips password and token fields before the snapshot is stored.

### 4.29 Every major module has a dashboard driven by its own data

A module dashboard answers "what needs attention today" before the operator opens the list. KPI values are computed in SQL over live rows — never hardcoded, and never derived client-side from one page of results.

Each dashboard carries KPI cards, the relevant charts, status summaries and a trend over time. What counts as relevant is per module: licences track expiry and import-versus-export; tracking tracks the pending stages and average processing time; finance tracks approval stages and cash-versus-bank; clients track activity and top clients.

Charts use the same tokens as everything else (§4.20) so they survive a theme switch, and every figure is reachable — clicking a KPI card filters that module's DataTable to exactly the rows it counted.

### 4.30 Typography carries the hierarchy

One scale, used everywhere: page title, section heading, field label, value, supporting text. Headings and labels are semibold or bold; values are regular weight; supporting text is `text-muted-foreground` (§4.20) one step smaller. A screen must read as a hierarchy without colour — if two levels are distinguishable only by hue, the weight is wrong.

Do not introduce a new font size at a call site. If the scale is missing a step, add it once in globals.css.

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
- **PDF / printable output:** every generated PDF or printable-HTML document (e.g. `src/db/queries/*Print.ts`, any `/print` route, any invoice/report export) MUST render **borders on all tables** — set `table { border-collapse: collapse }` plus a solid `1px solid #000` border on every `th`/`td`, wrap the document body in an outer bordered container, and enforce it in `@media print` (`table, th, td { border: 1px solid #000 !important }`) alongside `-webkit-print-color-adjust: exact; print-color-adjust: exact;` so borders and fills survive the print/PDF step. No borderless tables in any PDF.

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

### 7.2 Migrations — every DB change is a migration script

**Non-negotiable: no database change ships without a committed migration script.** If a change is not in `drizzle/`, it does not exist. Applying something by hand — via Drizzle Studio, `psql`, a one-off `pnpm tsx` script, `drizzle-kit push`, or a DDL statement typed into a terminal — is a defect, because the next environment (another dev, staging, production) will not have it. The rule covers **structure and data**:

- **Structure** (tables, columns, types, defaults, constraints, indexes, enums, views, functions, triggers): change the Drizzle schema file in `src/db/schema/`, run `pnpm db:generate`, review the generated SQL, and commit **both** the schema file and the generated `drizzle/*.sql` in the same commit.
- **Data** (master/config rows, backfills, corrections, renames of a status code, new `_master_t` seed entries, permission rows): write a migration too. Either add a hand-written `.sql` migration alongside the generated ones, or — when the change is a repeatable baseline — put it in `src/db/seed/` **and** reference it from a migration so a fresh database reaches the same state. Never fix data only in the running database.
- **Both together:** a change that adds a column *and* backfills it is one reviewed migration, not a migration plus a manual UPDATE someone is expected to remember.

Rules that follow from this:

- Never `drizzle-kit push` against shared, staging, or production databases. `push` is for local prototyping only, and anything it created locally must still be regenerated as a proper migration before commit.
- Migrations are immutable once merged. Fix a bad migration with a **new** migration — never edit, reorder, or delete an existing `drizzle/*.sql` or its journal entry.
- Migrations must be idempotent-safe to apply in order on an empty database. Don't depend on rows or objects that only exist because someone touched a specific environment by hand.
- Destructive migrations (drop column/table, narrow a type, delete rows) need an explicit heads-up to the user before generating — see §12.
- If you ever have to describe a DB change as "just run this SQL", stop: turn it into a migration file instead.

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
- If you changed any Drizzle schema, run `pnpm db:generate` and commit the generated SQL. Same for any data change — master rows, backfills, corrections — it goes in a migration script (§7.2), never applied by hand. Before declaring done, confirm a fresh database migrated from zero would end up in the state your change assumes.
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
- Requests to apply a schema or data change directly to the database (Studio, `psql`, a throwaway script, `drizzle-kit push` on a shared DB) → no, it goes in a migration script (§7.2).
- Requests to add an `<input type="checkbox">` for a boolean setting, or a second toggle/switch component → no, use `<Toggle>` (§4.11).
- Requests to label a client dropdown with `company_name` → no, pickers show `short_name` via the shared resolver (§4.15).
- Requests to add a raw `<select>` ("it's only a few options") → no, use `<SearchableSelect>` (§4.16).
- Requests to sort a dropdown's options alphabetically, or to pre-sort them at the call site → no, options render in id order via `orderOptions` (§4.16).
- Requests to write another private `fetchOptions` helper on a page → no, use `fetchMasterOptions` (§4.16, §4.10).
- Requests to put a save button on an individual accordion → no, a transaction page has one page-level Save (§4.17).
- Requests to type an asterisk into a label, or to style a required field's error state by hand → no, use `label.required` and the shared invalid CSS (§4.18).
- Requests to format a date inline or via `toLocaleDateString()` → no, use `formatDate` (§4.19).
- Requests to hardcode `text-slate-400` / `text-slate-500` or any palette colour for text → no, use `text-foreground` / `text-muted-foreground` (§4.20).
- Requests to hand-roll an export/print button's colours, or to colour the same action differently on two screens → no, use `btn-pdf` / `btn-excel` / `btn-neutral` (§4.20).
- Requests to recolour View / Edit / Delete away from black / blue / red, to leave a delete icon grey until hover, or to put a non-destructive action in the delete hue → no, those three hues are reserved (§4.20).
- Requests to drop the Cancel button from a modal, or to hide it while editing → no, every modal keeps a labelled way out (§4.21).
- Requests to report a save/delete with `alert()`, a toast-only, or a silent redirect → no, use `<ResultDialog>` and let OK do the navigating (§4.22).
- Requests to ship "Invalid input" / "Save failed" / a bare status code as a user-facing message, or to hand-format a Zod issue at a call site → no, name the field and the fix via `summarizeZodError` (§4.23).
- Requests to trust `File.type` for an upload, or to delete the previous file before the new URL is committed → no (§4.23, §4.24).
- Requests to let `public/` serve uploads directly ("it works locally") → no, Next only serves what was there at build time; uploads go through the route handler (§4.24).
- Requests to hand-roll a `<table>` for a new list screen → no, use `<DataTable>` (§4.25).
- Requests to hardcode an action colour or icon "just on this screen" → no, it is a row in `action_style_master_t` (§4.26).
- Requests to hard-delete a record on the normal Delete action, or to gate restore/permanent-delete behind `can_delete` → no, three operations, three permissions (§4.27).
- Requests to skip the audit entry "because it is only a read/export/print" → no, those are logged too (§4.28).
- Requests to hardcode a dashboard KPI, or to compute one from the current page of rows → no, it is a SQL aggregate over live data (§4.29).
- Requests to introduce a new font size at a call site → no, extend the scale in globals.css (§4.30).

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
