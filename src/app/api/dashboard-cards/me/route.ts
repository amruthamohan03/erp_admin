import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dashboardCardMaster, roleDashboardCardMapping } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

// Cards the logged-in user's role is allowed to see on the dashboard.
// Mapping row with is_visible=true is required — there is no implicit fallback,
// which matches how role-menu mapping behaves.
export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: dashboardCardMaster.id,
      card_key: dashboardCardMaster.cardKey,
      card_content_id: dashboardCardMaster.cardContentId,
      card_title: dashboardCardMaster.cardTitle,
      card_subtitle: dashboardCardMaster.cardSubtitle,
      card_icon: dashboardCardMaster.cardIcon,
      card_color: dashboardCardMaster.cardColor,
      card_url: dashboardCardMaster.cardUrl,
      card_category: dashboardCardMaster.cardCategory,
      data_source: dashboardCardMaster.dataSource,
      default_order: dashboardCardMaster.cardOrder,
      role_order: roleDashboardCardMapping.cardOrder,
    })
    .from(roleDashboardCardMapping)
    .innerJoin(
      dashboardCardMaster,
      eq(dashboardCardMaster.id, roleDashboardCardMapping.cardId),
    )
    .where(
      and(
        eq(roleDashboardCardMapping.roleId, session.role_id),
        eq(roleDashboardCardMapping.isVisible, true),
        eq(dashboardCardMaster.display, 'Y'),
      ),
    )
    .orderBy(
      asc(roleDashboardCardMapping.cardOrder),
      asc(dashboardCardMaster.cardOrder),
      asc(dashboardCardMaster.id),
    );

  const visible = rows.map(
    ({ default_order: _d, role_order: _r, ...rest }) => rest,
  );

  return ok(visible);
}
