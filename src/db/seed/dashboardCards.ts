import { eq, sql } from 'drizzle-orm';
import {
  dashboardCardMaster,
  roleDashboardCardMapping,
  type DashboardCardInsert,
} from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Seeds dashboard_card_master_t with the coloured stat cards that
// render on /dashboard + the module-specific dashboards. Adapted from
// main's drizzle/0047, 0053, 0063, 0068, 0076, 0078 seeds — the
// data_source URLs are rewritten to this branch's /api/v1/*/stats
// shapes, and card sets are trimmed to the fields our stats
// endpoints actually return.
//
// Every card gets a role_dashboard_card_mapping row granting
// Super Admin (role_id=1) visibility. Other roles are set up
// per-tenant via /mapping/roletodashboardcard.
//
// data_source format is '<endpoint>#<dot.json.path>' — see
// src/lib/dashboardDataSource.ts for how the /dashboard page
// resolves each card's value.

const ADMIN_ROLE_ID = 1;

type Card = Required<
  Pick<
    DashboardCardInsert,
    | 'cardKey'
    | 'cardContentId'
    | 'cardTitle'
    | 'cardOrder'
  >
> &
  Pick<
    DashboardCardInsert,
    | 'cardSubtitle'
    | 'cardIcon'
    | 'cardColor'
    | 'cardUrl'
    | 'cardCategory'
    | 'dataSource'
    | 'display'
  >;

const CARDS: Card[] = [
  // ── Client dashboard (category='client_dashboard') ─────────────
  // Data source: /api/v1/clients/dashboard returns {aggregates:{...},
  // monthly:[], top_activity:[]}. Card values come from the aggregates
  // block.
  {
    cardKey: 'client.total',
    cardContentId: 'total',
    cardTitle: 'Total Clients',
    cardSubtitle: 'All time',
    cardIcon: 'Users',
    cardColor: 'violet',
    cardUrl: '/masters/clients',
    cardOrder: 1,
    cardCategory: 'client_dashboard',
    dataSource: '/api/v1/clients/dashboard#aggregates.total_count',
    display: 'Y',
  },
  {
    cardKey: 'client.active',
    cardContentId: 'active',
    cardTitle: 'Active Clients',
    cardSubtitle: 'display=Y',
    cardIcon: 'CheckCircle2',
    cardColor: 'emerald',
    cardUrl: '/masters/clients',
    cardOrder: 2,
    cardCategory: 'client_dashboard',
    dataSource: '/api/v1/clients/dashboard#aggregates.active_count',
    display: 'Y',
  },
  {
    cardKey: 'client.this_month',
    cardContentId: 'this_month',
    cardTitle: 'Onboarded This Month',
    cardSubtitle: 'MTD',
    cardIcon: 'Calendar',
    cardColor: 'sky',
    cardUrl: '/masters/clients',
    cardOrder: 3,
    cardCategory: 'client_dashboard',
    dataSource: '/api/v1/clients/dashboard#aggregates.this_month_count',
    display: 'Y',
  },
  {
    cardKey: 'client.today',
    cardContentId: 'today',
    cardTitle: 'Onboarded Today',
    cardSubtitle: 'Since midnight',
    cardIcon: 'Sunrise',
    cardColor: 'amber',
    cardUrl: '/masters/clients',
    cardOrder: 4,
    cardCategory: 'client_dashboard',
    dataSource: '/api/v1/clients/dashboard#aggregates.today_count',
    display: 'Y',
  },
  {
    cardKey: 'client.with_email',
    cardContentId: 'with_email',
    cardTitle: 'With Email',
    cardSubtitle: 'Complete records',
    cardIcon: 'Mail',
    cardColor: 'teal',
    cardUrl: '/masters/clients',
    cardOrder: 5,
    cardCategory: 'client_dashboard',
    dataSource: '/api/v1/clients/dashboard#aggregates.with_email_count',
    display: 'Y',
  },
  {
    cardKey: 'client.with_phone',
    cardContentId: 'with_phone',
    cardTitle: 'With Phone',
    cardSubtitle: 'Complete records',
    cardIcon: 'Phone',
    cardColor: 'fuchsia',
    cardUrl: '/masters/clients',
    cardOrder: 6,
    cardCategory: 'client_dashboard',
    dataSource: '/api/v1/clients/dashboard#aggregates.with_phone_count',
    display: 'Y',
  },
  {
    cardKey: 'client.with_tax_id',
    cardContentId: 'with_tax_id',
    cardTitle: 'With Tax ID',
    cardSubtitle: 'DGI-compliant',
    cardIcon: 'Hash',
    cardColor: 'rose',
    cardUrl: '/masters/clients',
    cardOrder: 7,
    cardCategory: 'client_dashboard',
    dataSource: '/api/v1/clients/dashboard#aggregates.with_tax_id_count',
    display: 'Y',
  },

  // ── Main dashboard (category='general') — cross-module KPIs ────
  // Show up on /dashboard by default. Each links to its own module's
  // list page.
  {
    cardKey: 'general.clients',
    cardContentId: 'clients',
    cardTitle: 'Total Clients',
    cardSubtitle: null,
    cardIcon: 'Users',
    cardColor: 'violet',
    cardUrl: '/clients/dashboard',
    cardOrder: 1,
    cardCategory: 'general',
    dataSource: '/api/v1/clients/dashboard#aggregates.total_count',
    display: 'Y',
  },
  {
    cardKey: 'general.licenses',
    cardContentId: 'licenses',
    cardTitle: 'Total Licenses',
    cardSubtitle: null,
    cardIcon: 'FileCheck',
    cardColor: 'primary',
    cardUrl: '/licenses',
    cardOrder: 2,
    cardCategory: 'general',
    dataSource: '/api/v1/licenses/stats#total_count',
    display: 'Y',
  },
  {
    cardKey: 'general.licenses_expiring',
    cardContentId: 'licenses_expiring',
    cardTitle: 'Licenses Expiring (30d)',
    cardSubtitle: null,
    cardIcon: 'CalendarClock',
    cardColor: 'amber',
    cardUrl: '/licenses',
    cardOrder: 3,
    cardCategory: 'general',
    dataSource: '/api/v1/licenses/stats#expiring_soon_count',
    display: 'Y',
  },
  {
    cardKey: 'general.imports',
    cardContentId: 'imports',
    cardTitle: 'Total Imports',
    cardSubtitle: null,
    cardIcon: 'Boxes',
    cardColor: 'sky',
    cardUrl: '/imports',
    cardOrder: 4,
    cardCategory: 'general',
    dataSource: '/api/v1/imports/stats#total_count',
    display: 'Y',
  },
  {
    cardKey: 'general.imports_month',
    cardContentId: 'imports_month',
    cardTitle: 'Imports This Month',
    cardSubtitle: null,
    cardIcon: 'CalendarPlus',
    cardColor: 'teal',
    cardUrl: '/imports',
    cardOrder: 5,
    cardCategory: 'general',
    dataSource: '/api/v1/imports/stats#this_month_count',
    display: 'Y',
  },
  {
    cardKey: 'general.exports',
    cardContentId: 'exports',
    cardTitle: 'Total Exports',
    cardSubtitle: null,
    cardIcon: 'Ship',
    cardColor: 'emerald',
    cardUrl: '/exports',
    cardOrder: 6,
    cardCategory: 'general',
    dataSource: '/api/v1/exports/stats#total_count',
    display: 'Y',
  },
  {
    cardKey: 'general.exports_month',
    cardContentId: 'exports_month',
    cardTitle: 'Exports This Month',
    cardSubtitle: null,
    cardIcon: 'CalendarCheck',
    cardColor: 'lime',
    cardUrl: '/exports',
    cardOrder: 7,
    cardCategory: 'general',
    dataSource: '/api/v1/exports/stats#this_month_count',
    display: 'Y',
  },
  {
    cardKey: 'general.quotations',
    cardContentId: 'quotations',
    cardTitle: 'Total Quotations',
    cardSubtitle: null,
    cardIcon: 'FileText',
    cardColor: 'fuchsia',
    cardUrl: '/quotations',
    cardOrder: 8,
    cardCategory: 'general',
    dataSource: '/api/v1/quotations/stats#total_count',
    display: 'Y',
  },

  // ── Import dashboard (category='import_dashboard') ─────────────
  {
    cardKey: 'import.total',
    cardContentId: 'total',
    cardTitle: 'Total Imports',
    cardSubtitle: 'All time',
    cardIcon: 'Boxes',
    cardColor: 'primary',
    cardUrl: '/imports',
    cardOrder: 1,
    cardCategory: 'import_dashboard',
    dataSource: '/api/v1/imports/stats#total_count',
    display: 'Y',
  },
  {
    cardKey: 'import.this_month',
    cardContentId: 'this_month',
    cardTitle: 'This Month',
    cardSubtitle: 'MTD',
    cardIcon: 'Calendar',
    cardColor: 'sky',
    cardUrl: '/imports',
    cardOrder: 2,
    cardCategory: 'import_dashboard',
    dataSource: '/api/v1/imports/stats#this_month_count',
    display: 'Y',
  },
  {
    cardKey: 'import.total_fob',
    cardContentId: 'total_fob',
    cardTitle: 'Total FOB',
    cardSubtitle: 'USD (all-time)',
    cardIcon: 'TrendingUp',
    cardColor: 'emerald',
    cardUrl: '/imports',
    cardOrder: 3,
    cardCategory: 'import_dashboard',
    dataSource: '/api/v1/imports/stats#total_fob',
    display: 'Y',
  },
  {
    cardKey: 'import.total_weight',
    cardContentId: 'total_weight',
    cardTitle: 'Total Weight',
    cardSubtitle: 'kg (all-time)',
    cardIcon: 'Weight',
    cardColor: 'amber',
    cardUrl: '/imports',
    cardOrder: 4,
    cardCategory: 'import_dashboard',
    dataSource: '/api/v1/imports/stats#total_weight',
    display: 'Y',
  },

  // ── Export dashboard (category='export_dashboard') ─────────────
  {
    cardKey: 'export.total',
    cardContentId: 'total',
    cardTitle: 'Total Exports',
    cardSubtitle: 'All time',
    cardIcon: 'Ship',
    cardColor: 'primary',
    cardUrl: '/exports',
    cardOrder: 1,
    cardCategory: 'export_dashboard',
    dataSource: '/api/v1/exports/stats#total_count',
    display: 'Y',
  },
  {
    cardKey: 'export.this_month',
    cardContentId: 'this_month',
    cardTitle: 'Loaded This Month',
    cardSubtitle: 'MTD',
    cardIcon: 'CalendarCheck',
    cardColor: 'sky',
    cardUrl: '/exports',
    cardOrder: 2,
    cardCategory: 'export_dashboard',
    dataSource: '/api/v1/exports/stats#this_month_count',
    display: 'Y',
  },
  {
    cardKey: 'export.total_fob',
    cardContentId: 'total_fob',
    cardTitle: 'Total FOB',
    cardSubtitle: 'USD (all-time)',
    cardIcon: 'TrendingUp',
    cardColor: 'emerald',
    cardUrl: '/exports',
    cardOrder: 3,
    cardCategory: 'export_dashboard',
    dataSource: '/api/v1/exports/stats#total_fob',
    display: 'Y',
  },
  {
    cardKey: 'export.total_weight',
    cardContentId: 'total_weight',
    cardTitle: 'Total Weight',
    cardSubtitle: 'MT (all-time)',
    cardIcon: 'Weight',
    cardColor: 'amber',
    cardUrl: '/exports',
    cardOrder: 4,
    cardCategory: 'export_dashboard',
    dataSource: '/api/v1/exports/stats#total_weight',
    display: 'Y',
  },

  // ── License dashboard (category='license_dashboard') ───────────
  {
    cardKey: 'license.total',
    cardContentId: 'total',
    cardTitle: 'Total Licenses',
    cardSubtitle: 'All',
    cardIcon: 'FileCheck',
    cardColor: 'primary',
    cardUrl: '/licenses',
    cardOrder: 1,
    cardCategory: 'license_dashboard',
    dataSource: '/api/v1/licenses/stats#total_count',
    display: 'Y',
  },
  {
    cardKey: 'license.issued',
    cardContentId: 'issued',
    cardTitle: 'Issued',
    cardSubtitle: 'Live licenses',
    cardIcon: 'CheckCircle2',
    cardColor: 'emerald',
    cardUrl: '/licenses',
    cardOrder: 2,
    cardCategory: 'license_dashboard',
    dataSource: '/api/v1/licenses/stats#issued_count',
    display: 'Y',
  },
  {
    cardKey: 'license.approved',
    cardContentId: 'approved',
    cardTitle: 'Approved',
    cardSubtitle: 'Not yet issued',
    cardIcon: 'ShieldCheck',
    cardColor: 'teal',
    cardUrl: '/licenses',
    cardOrder: 3,
    cardCategory: 'license_dashboard',
    dataSource: '/api/v1/licenses/stats#approved_count',
    display: 'Y',
  },
  {
    cardKey: 'license.pending',
    cardContentId: 'pending',
    cardTitle: 'Pending',
    cardSubtitle: 'Draft / In review',
    cardIcon: 'Clock',
    cardColor: 'amber',
    cardUrl: '/licenses',
    cardOrder: 4,
    cardCategory: 'license_dashboard',
    dataSource: '/api/v1/licenses/stats#pending_count',
    display: 'Y',
  },
  {
    cardKey: 'license.cancelled',
    cardContentId: 'cancelled',
    cardTitle: 'Cancelled',
    cardSubtitle: 'Rejected licenses',
    cardIcon: 'XCircle',
    cardColor: 'slate',
    cardUrl: '/licenses',
    cardOrder: 5,
    cardCategory: 'license_dashboard',
    dataSource: '/api/v1/licenses/stats#cancelled_count',
    display: 'Y',
  },
  {
    cardKey: 'license.expiring_soon',
    cardContentId: 'expiring_soon',
    cardTitle: 'Expiring in 30 days',
    cardSubtitle: 'Renewal window',
    cardIcon: 'CalendarClock',
    cardColor: 'rose',
    cardUrl: '/licenses',
    cardOrder: 6,
    cardCategory: 'license_dashboard',
    dataSource: '/api/v1/licenses/stats#expiring_soon_count',
    display: 'Y',
  },

  // ── Quotation dashboard (category='quotation_dashboard') ───────
  {
    cardKey: 'quotation.total',
    cardContentId: 'total',
    cardTitle: 'Total Quotations',
    cardSubtitle: null,
    cardIcon: 'FileText',
    cardColor: 'primary',
    cardUrl: '/quotations',
    cardOrder: 1,
    cardCategory: 'quotation_dashboard',
    dataSource: '/api/v1/quotations/stats#total_count',
    display: 'Y',
  },
  {
    cardKey: 'quotation.this_month',
    cardContentId: 'this_month',
    cardTitle: 'This Month',
    cardSubtitle: null,
    cardIcon: 'Calendar',
    cardColor: 'sky',
    cardUrl: '/quotations',
    cardOrder: 2,
    cardCategory: 'quotation_dashboard',
    dataSource: '/api/v1/quotations/stats#this_month_count',
    display: 'Y',
  },
  {
    cardKey: 'quotation.total_usd',
    cardContentId: 'total_usd',
    cardTitle: 'Total USD',
    cardSubtitle: null,
    cardIcon: 'DollarSign',
    cardColor: 'emerald',
    cardUrl: '/quotations',
    cardOrder: 3,
    cardCategory: 'quotation_dashboard',
    dataSource: '/api/v1/quotations/stats#total_usd',
    display: 'Y',
  },
  {
    cardKey: 'quotation.total_cdf',
    cardContentId: 'total_cdf',
    cardTitle: 'Total CDF',
    cardSubtitle: null,
    cardIcon: 'Coins',
    cardColor: 'amber',
    cardUrl: '/quotations',
    cardOrder: 4,
    cardCategory: 'quotation_dashboard',
    dataSource: '/api/v1/quotations/stats#total_cdf',
    display: 'Y',
  },
];

export async function seedDashboardCards(
  db: Database | Transaction,
): Promise<void> {
  for (const card of CARDS) {
    // Upsert by card_key (unique).
    const [existing] = await db
      .select({ id: dashboardCardMaster.id })
      .from(dashboardCardMaster)
      .where(eq(dashboardCardMaster.cardKey, card.cardKey))
      .limit(1);

    let cardId: number;
    if (existing) {
      await db
        .update(dashboardCardMaster)
        .set({
          cardContentId: card.cardContentId,
          cardTitle: card.cardTitle,
          cardSubtitle: card.cardSubtitle,
          cardIcon: card.cardIcon,
          cardColor: card.cardColor,
          cardUrl: card.cardUrl,
          cardOrder: card.cardOrder,
          cardCategory: card.cardCategory,
          dataSource: card.dataSource,
          display: card.display,
          updatedAt: sql`now()`,
        })
        .where(eq(dashboardCardMaster.id, existing.id));
      cardId = existing.id;
    } else {
      const [inserted] = await db
        .insert(dashboardCardMaster)
        .values(card)
        .returning({ id: dashboardCardMaster.id });
      if (!inserted) {
        throw new Error(`seedDashboardCards: insert failed for ${card.cardKey}`);
      }
      cardId = inserted.id;
    }

    // Grant Super Admin visibility.
    await db
      .insert(roleDashboardCardMapping)
      .values({
        roleId: ADMIN_ROLE_ID,
        cardId,
        isVisible: true,
        cardOrder: card.cardOrder,
      })
      .onConflictDoUpdate({
        target: [
          roleDashboardCardMapping.roleId,
          roleDashboardCardMapping.cardId,
        ],
        set: {
          isVisible: true,
          cardOrder: card.cardOrder,
          updatedAt: sql`now()`,
        },
      });
  }
}
