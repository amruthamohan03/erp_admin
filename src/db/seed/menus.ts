import { and, eq, isNull, sql } from 'drizzle-orm';
import { menuMaster, roleMenuMapping } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// One authoritative seed for the sidebar hierarchy. Reconstructs the
// original 2-level menu tree from erp_admin_org.sql (menu_master_t
// dump) row-by-row, with URLs rewritten to the routes that actually
// exist on this branch.
//
// This replaces the ~40 per-master menu seed files that were being
// generated one at a time — the sidebar structure is really one
// coherent decision, and splitting it across dozens of files made it
// impossible to audit against the original. Adding a new master now
// means one edit to SPEC below (choosing which parent it belongs to)
// rather than a new seed file + orchestrator update.
//
// Natural key is `menu_name` (parents are guaranteed unique; children
// are unique within a parent by convention). Two-pass insert so
// parents get DB ids before children reference them via `menu_id`.
//
// Every seeded row also gets the admin (role_id=1) full grant so the
// Super Admin can navigate everywhere by default. Non-admin role
// grants stay in `role_menu_mapping_t` and are managed via
// /mapping/roletomenu.
//
// Placeholders: rows where the original pointed at a page we haven't
// ported get `url: '#'` and a `note` field. They still render in the
// sidebar (with the collapse-only behavior of parent groups) so the
// operator sees the shape they're used to; clicking does nothing
// until the target page ships.

const ADMIN_ROLE_ID = 1;

interface ParentSpec {
  name: string;
  order: number;
  icon: string;
  display?: 'Y' | 'N';
}

interface ChildSpec {
  parent: string;
  name: string;
  order: number;
  url: string;
  icon?: string;
  display?: 'Y' | 'N';
  /** Set when url === '#' — future work to port the referenced page. */
  note?: string;
}

// ── Parent groups (menu_level = 0) ────────────────────────────────
// Order preserved from the original; duplicates (Sydonia + Fiche De
// Calcul both at 8) kept as-is because Postgres doesn't enforce
// order uniqueness.
const PARENTS: ParentSpec[] = [
  { name: 'Dashboard', order: 1, icon: 'ti ti-dashboard' },
  { name: 'Masters', order: 2, icon: 'ti ti-layout' },
  { name: 'Client Management', order: 3, icon: 'ti ti-user-circle' },
  { name: 'Mapping', order: 4, icon: 'ti ti-layout-grid' },
  { name: 'Import License', order: 5, icon: 'ti ti-file-certificate' },
  { name: 'Tracking Management', order: 6, icon: 'ti ti-truck' },
  { name: 'Payment', order: 7, icon: 'ti ti-cash' },
  { name: 'Sydonia', order: 8, icon: 'ti ti-file' },
  { name: 'Fiche De Calcul', order: 8, icon: 'ti ti-file' },
  { name: 'Quotation Management', order: 9, icon: 'ti ti-cash' },
  { name: 'Invoice Management', order: 10, icon: 'ti ti-invoice' },
  { name: 'Seal Tracker', order: 11, icon: 'ti ti-lock' },
  { name: 'Advance Payment', order: 82, icon: 'ti ti-wallet' },
  { name: 'DGI Reports', order: 94, icon: 'ti ti-report' },
];

// The single Dashboard entry (id=1 in the original) links directly
// to /dashboard rather than being a `#` group. We model that by
// making 'Dashboard' a parent with its own URL — the sidebar
// renderer treats parent rows with a real URL as clickable leaves.
// So we override Dashboard's `url` at insert-time to `/dashboard`;
// every other parent stays at `#`.

// ── Children (menu_level = 1) ─────────────────────────────────────
// Preserved verbatim from the SQL dump. `order` matches the original
// `menu_order` column; `url` is rewritten to our branch's route.
// Where the original URL points at a page we haven't ported,
// `url: '#'` + `note` marks the gap.
const CHILDREN: ChildSpec[] = [
  // ── Masters (original menu_id=3) ────────────────────────────────
  { parent: 'Masters', name: 'Menu Management', order: 1, url: '/masters/menu' },
  { parent: 'Masters', name: 'Banklist', order: 2, url: '/masters/banks' },
  { parent: 'Masters', name: 'Bank Exchange Rates', order: 3, url: '/bank-exchange-rates' },
  { parent: 'Masters', name: 'Clearance', order: 4, url: '/masters/clearances' },
  { parent: 'Masters', name: 'Clearing Status', order: 5, url: '/masters/clearing-statuses' },
  { parent: 'Masters', name: 'Kind', order: 6, url: '/masters/kinds' },
  { parent: 'Masters', name: 'Transit Point', order: 7, url: '/masters/transit-points' },
  { parent: 'Masters', name: 'Department', order: 8, url: '/masters/departments' },
  { parent: 'Masters', name: 'Expense', order: 9, url: '/masters/expense-types' },
  { parent: 'Masters', name: 'Feetcontainer', order: 10, url: '/masters/feet-containers' },
  { parent: 'Masters', name: 'Role', order: 11, url: '/masters/roles' },
  { parent: 'Masters', name: 'Type Of Goods', order: 12, url: '/masters/goods-types' },
  { parent: 'Masters', name: 'Regime', order: 13, url: '/masters/regimes' },
  { parent: 'Masters', name: 'Hscode', order: 14, url: '/masters/hscodes' },
  { parent: 'Masters', name: 'Users', order: 15, url: '/masters/users' },
  { parent: 'Masters', name: 'Phase', order: 16, url: '/masters/phases' },
  { parent: 'Masters', name: 'Province', order: 17, url: '/masters/provinces' },
  {
    parent: 'Masters',
    name: 'Final warehouse',
    order: 18,
    url: '#',
    note: 'No dedicated route — transit-point flags cover the concept.',
  },
  { parent: 'Masters', name: 'Incoterm', order: 19, url: '/masters/incoterms' },
  { parent: 'Masters', name: 'Industry', order: 20, url: '/masters/industries' },
  { parent: 'Masters', name: 'Item', order: 21, url: '/masters/items' },
  { parent: 'Masters', name: 'Origin', order: 22, url: '/masters/origins' },
  {
    parent: 'Masters',
    name: 'Payment Method',
    order: 23,
    url: '#',
    note: 'TODO(port): payment_method_master_t not on branch (payment-types + payment-subtypes are close).',
  },
  { parent: 'Masters', name: 'Payment Type', order: 24, url: '/masters/payment-types' },
  { parent: 'Masters', name: 'Refferer', order: 25, url: '/masters/referers' },
  { parent: 'Masters', name: 'Dashboard Cards', order: 25, url: '/masters/dashboard-cards' },
  { parent: 'Masters', name: 'Currency', order: 26, url: '/masters/currencies' },
  { parent: 'Masters', name: 'Transport', order: 28, url: '/masters/transport-modes' },
  { parent: 'Masters', name: 'Truck Status', order: 29, url: '/masters/truck-statuses' },
  { parent: 'Masters', name: 'Unit', order: 30, url: '/masters/units' },
  { parent: 'Masters', name: 'Document Status', order: 31, url: '/masters/document-statuses' },
  { parent: 'Masters', name: 'Payment Subtype', order: 32, url: '/masters/payment-subtypes' },
  {
    parent: 'Masters',
    name: 'Perdiem',
    order: 33,
    url: '#',
    note: 'TODO(port): perdiem_master_t not on branch.',
  },
  { parent: 'Masters', name: 'Seal', order: 34, url: '/masters/seals' },
  { parent: 'Masters', name: 'Sub Office', order: 35, url: '/masters/sub-offices' },
  { parent: 'Masters', name: 'Main Office', order: 36, url: '/masters/offices' },
  {
    parent: 'Masters',
    name: 'Language Translation',
    order: 38,
    url: '#',
    note: 'TODO(port): translation admin UI not on branch (API exists at /api/v1/translate).',
  },
  { parent: 'Masters', name: 'Quotation Description', order: 89, url: '/masters/quotation-categories' },
  { parent: 'Masters', name: 'Invoice Bank', order: 107, url: '/masters/invoice-banks' },
  // New masters added on this branch — appended at the end so they
  // don't disturb the original ordering.
  { parent: 'Masters', name: 'Partials', order: 200, url: '/masters/partials' },
  { parent: 'Masters', name: 'Commodities', order: 201, url: '/masters/commodities' },
  { parent: 'Masters', name: 'Done By', order: 202, url: '/masters/done-by' },
  { parent: 'Masters', name: 'Group Companies', order: 203, url: '/masters/group-companies' },
  { parent: 'Masters', name: 'Form Definitions', order: 204, url: '/masters/forms' },

  // ── Client Management (original menu_id=2) ──────────────────────
  { parent: 'Client Management', name: 'Clients', order: 1, url: '/masters/clients' },
  { parent: 'Client Management', name: 'Client Dashboard', order: 47, url: '/clients/dashboard' },

  // ── Mapping (original menu_id=80) ───────────────────────────────
  {
    parent: 'Mapping',
    name: 'Client to Bank',
    order: 2,
    url: '#',
    note: 'TODO(port): client_bank_mapping_t not on branch.',
  },
  { parent: 'Mapping', name: 'Dashboard Cards Mapping', order: 3, url: '/mapping/roletodashboardcard' },
  { parent: 'Mapping', name: 'Role Menu Mapping', order: 12, url: '/mapping/roletomenu' },
  // New on this branch — form-field role grants.
  { parent: 'Mapping', name: 'Field Grants', order: 20, url: '/mapping/fieldgrants' },

  // ── Import License (original menu_id=110) ───────────────────────
  { parent: 'Import License', name: 'Create Import License', order: 1, url: '/licenses/new' },
  { parent: 'Import License', name: 'License Dashboard', order: 2, url: '/licenses/dashboard' },
  { parent: 'Import License', name: 'Licenses (list)', order: 3, url: '/licenses' },
  {
    parent: 'Import License',
    name: 'Bivac',
    order: 88,
    url: '#',
    note: 'TODO(port): bivac module not on branch.',
  },
  {
    parent: 'Import License',
    name: 'IMPORT APURMENT',
    order: 103,
    url: '#',
    note: 'TODO(port): import apurment module not on branch.',
  },
  {
    parent: 'Import License',
    name: 'Import Synthesis',
    order: 109,
    url: '#',
    note: 'TODO(port): import synthesis report not on branch.',
  },

  // ── Tracking Management (original menu_id=55) ───────────────────
  {
    parent: 'Tracking Management',
    name: 'Local Tracking',
    order: 37,
    url: '#',
    note: 'TODO(port): local tracking module not on branch.',
  },
  {
    parent: 'Tracking Management',
    name: 'Import Tracking',
    order: 39,
    url: '#',
    note: 'TODO(port): separate import tracking module — /imports is the customs consignment page under Sydonia.',
  },
  {
    parent: 'Tracking Management',
    name: 'Export Tracking',
    order: 40,
    url: '#',
    note: 'TODO(port): separate export tracking module — /exports is under Sydonia.',
  },
  {
    parent: 'Tracking Management',
    name: 'Local Dashboard',
    order: 49,
    url: '#',
    note: 'TODO(port): local tracking dashboard not on branch.',
  },
  {
    parent: 'Tracking Management',
    name: 'Import Dashboard',
    order: 53,
    url: '/imports/dashboard',
  },
  {
    parent: 'Tracking Management',
    name: 'Export Dashboard',
    order: 106,
    url: '/exports/dashboard',
  },
  {
    parent: 'Tracking Management',
    name: 'Import KPI',
    order: 113,
    url: '#',
    note: 'TODO(port): import KPI dashboard not on branch.',
  },
  { parent: 'Tracking Management', name: 'Tracking Dashboard', order: 114, url: '/tracking' },
  {
    parent: 'Tracking Management',
    name: 'Client Import Dashboard',
    order: 115,
    url: '#',
    note: 'TODO(port): per-client import dashboard not on branch.',
  },
  {
    parent: 'Tracking Management',
    name: 'Export KPI',
    order: 116,
    url: '#',
    note: 'TODO(port): export KPI dashboard not on branch.',
  },

  // ── Payment (original menu_id=59) ───────────────────────────────
  { parent: 'Payment', name: 'Payment Request', order: 43, url: '/payment-requests' },

  // ── Sydonia (original menu_id=61) ───────────────────────────────
  { parent: 'Sydonia', name: 'Import Sydonia', order: 41, url: '/imports' },
  { parent: 'Sydonia', name: 'Export Sydonia', order: 42, url: '/exports' },

  // ── Fiche De Calcul (original menu_id=65) ───────────────────────
  { parent: 'Fiche De Calcul', name: 'Fiche De Calcul', order: 44, url: '/fiche-de-calcul' },

  // ── Quotation Management (original menu_id=67) ──────────────────
  { parent: 'Quotation Management', name: 'Quotation Dashboard', order: 44, url: '/quotations/dashboard' },
  { parent: 'Quotation Management', name: 'Invoice Quotation', order: 45, url: '/quotations' },

  // ── Invoice Management (original menu_id=68) ────────────────────
  { parent: 'Invoice Management', name: 'FV IMP Clearing Service', order: 46, url: '/invoices' },
  {
    parent: 'Invoice Management',
    name: 'FV EXP Clearing Service',
    order: 86,
    url: '#',
    note: 'TODO(port): differentiated export invoice flow — /invoices covers all invoice types today.',
  },
  {
    parent: 'Invoice Management',
    name: 'FV Other Service',
    order: 87,
    url: '#',
    note: 'TODO(port): differentiated other-service invoice flow.',
  },
  { parent: 'Invoice Management', name: 'FA IMP Clearing Service', order: 101, url: '/credit-notes' },
  {
    parent: 'Invoice Management',
    name: 'FA EXP Clearing Service',
    order: 102,
    url: '#',
    note: 'TODO(port): differentiated export credit-note flow.',
  },
  {
    parent: 'Invoice Management',
    name: 'FA Other Services',
    order: 102,
    url: '#',
    note: 'TODO(port): differentiated other-service credit-note flow.',
  },
  {
    parent: 'Invoice Management',
    name: 'Import Invoice Dashboard',
    order: 108,
    url: '#',
    note: 'TODO(port): import invoice dashboard not on branch.',
  },

  // ── Seal Tracker (original menu_id=75) ──────────────────────────
  { parent: 'Seal Tracker', name: 'Seal Tracker', order: 50, url: '/masters/seals' },

  // ── Advance Payment (original menu_id=83) ───────────────────────
  // All five customs pre-payment flows are on main but not on branch.
  // Kept as placeholders so the group stays populated.
  {
    parent: 'Advance Payment',
    name: 'CEEC Payment',
    order: 84,
    url: '#',
    note: 'TODO(port): CEEC advance payment flow.',
  },
  {
    parent: 'Advance Payment',
    name: 'CGEA Payment',
    order: 85,
    url: '#',
    note: 'TODO(port): CGEA advance payment flow.',
  },
  {
    parent: 'Advance Payment',
    name: 'OCC Payment',
    order: 90,
    url: '#',
    note: 'TODO(port): OCC advance payment flow.',
  },
  {
    parent: 'Advance Payment',
    name: 'LMC Payment',
    order: 91,
    url: '#',
    note: 'TODO(port): LMC advance payment flow.',
  },
  {
    parent: 'Advance Payment',
    name: 'OGEFREM Payment',
    order: 92,
    url: '#',
    note: 'TODO(port): OGEFREM advance payment flow.',
  },

  // ── DGI Reports (original menu_id=94) ───────────────────────────
  // Three specialised DGI reports; our /reports module covers the
  // generic surface. Each linked to /reports as a starting point.
  { parent: 'DGI Reports', name: 'X Report (Current Session)', order: 95, url: '/reports' },
  { parent: 'DGI Reports', name: 'Z Report (Closed Session)', order: 96, url: '/reports' },
  { parent: 'DGI Reports', name: 'A Report (Articles)', order: 97, url: '/reports' },

  // ── Branch-only top-level extras — belong under Masters if we
  // ever grow "operational tools" as its own group. For now, kept
  // as unattached top-level via a synthetic parent.
];

// New top-level rows added on this branch that don't map to any
// original group. Kept as bona-fide top-level entries with real URLs
// (rendered as clickable leaves by the sidebar).
const EXTRA_TOP_LEVEL: Array<{
  name: string;
  order: number;
  url: string;
  icon: string;
}> = [
  { name: 'Bulk Update', order: 95, url: '/bulk-update', icon: 'ti ti-edit' },
  { name: 'Reports', order: 96, url: '/reports', icon: 'ti ti-report' },
  { name: 'Settings', order: 97, url: '/settings', icon: 'ti ti-settings' },
];

async function upsertMenu(
  db: Database | Transaction,
  row: {
    menuName: string;
    url: string;
    menuId: number | null;
    menuLevel: number;
    menuOrder: number;
    icon: string;
    display: 'Y' | 'N';
  },
): Promise<number> {
  // Idempotent by (menu_name, coalesce(menu_id, 0)) — a name is unique
  // within its parent scope. Two menus can share a name across
  // different parents (unlikely in practice but the constraint holds).
  const [existing] = await db
    .select({ id: menuMaster.id })
    .from(menuMaster)
    .where(
      and(
        eq(menuMaster.menuName, row.menuName),
        row.menuId === null
          ? isNull(menuMaster.menuId)
          : eq(menuMaster.menuId, row.menuId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(menuMaster)
      .set({
        url: row.url,
        menuOrder: row.menuOrder,
        menuLevel: row.menuLevel,
        icon: row.icon,
        display: row.display,
        updatedAt: sql`now()`,
      })
      .where(eq(menuMaster.id, existing.id));
    return existing.id;
  }

  const [inserted] = await db
    .insert(menuMaster)
    .values({
      menuName: row.menuName,
      url: row.url,
      menuId: row.menuId,
      menuLevel: row.menuLevel,
      menuOrder: row.menuOrder,
      icon: row.icon,
      display: row.display,
    })
    .returning({ id: menuMaster.id });
  if (!inserted) throw new Error(`seedMenus: insert returned no row for ${row.menuName}`);
  return inserted.id;
}

async function grantAdmin(
  db: Database | Transaction,
  menuId: number,
): Promise<void> {
  await db
    .insert(roleMenuMapping)
    .values({
      roleId: ADMIN_ROLE_ID,
      menuId,
      canView: true,
      canAdd: true,
      canEdit: true,
      canDelete: true,
      canApprove: true,
    })
    .onConflictDoUpdate({
      target: [roleMenuMapping.roleId, roleMenuMapping.menuId],
      set: {
        canView: true,
        canAdd: true,
        canEdit: true,
        canDelete: true,
        canApprove: true,
        updatedAt: sql`now()`,
      },
    });
}

export async function seedMenus(db: Database | Transaction): Promise<void> {
  const parentIds = new Map<string, number>();

  // Pass 1: parents. Dashboard is the special case — it's a
  // clickable leaf at the top level with url='/dashboard', so we
  // insert it with the real URL rather than '#'. All other parents
  // are '#' collapsible groups.
  for (const p of PARENTS) {
    const id = await upsertMenu(db, {
      menuName: p.name,
      url: p.name === 'Dashboard' ? '/dashboard' : '#',
      menuId: null,
      menuLevel: 0,
      menuOrder: p.order,
      icon: p.icon,
      display: p.display ?? 'Y',
    });
    parentIds.set(p.name, id);
    await grantAdmin(db, id);
  }

  // Pass 2: children.
  for (const c of CHILDREN) {
    const parentId = parentIds.get(c.parent);
    if (!parentId) {
      throw new Error(
        `seedMenus: child "${c.name}" references missing parent "${c.parent}"`,
      );
    }
    const id = await upsertMenu(db, {
      menuName: c.name,
      url: c.url,
      menuId: parentId,
      menuLevel: 1,
      menuOrder: c.order,
      icon: c.icon ?? '',
      display: c.display ?? 'Y',
    });
    await grantAdmin(db, id);
  }

  // Pass 3: branch-only top-level extras.
  for (const t of EXTRA_TOP_LEVEL) {
    const id = await upsertMenu(db, {
      menuName: t.name,
      url: t.url,
      menuId: null,
      menuLevel: 0,
      menuOrder: t.order,
      icon: t.icon,
      display: 'Y',
    });
    await grantAdmin(db, id);
  }
}
