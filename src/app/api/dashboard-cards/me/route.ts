import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { roleDashboardCardMapping } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

// Cards the logged-in user's role is allowed to see on the dashboard.
// Mapping row with is_visible=true is required — there is no implicit fallback,
// which matches how role-menu mapping behaves.
export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db.query.roleDashboardCardMapping.findMany({
    where: and(
      eq(roleDashboardCardMapping.roleId, session.role_id),
      eq(roleDashboardCardMapping.isVisible, true),
    ),
    columns: { cardOrder: true },
    with: {
      card: true,
    },
    orderBy: [asc(roleDashboardCardMapping.cardOrder)],
  });

  // Hide cards the master has disabled, then expose only the columns the
  // dashboard actually renders.
  const visible = rows
    .filter((r) => r.card && r.card.display === 'Y')
    .map((r) => ({
      id: r.card.id,
      card_key: r.card.cardKey,
      card_content_id: r.card.cardContentId,
      card_title: r.card.cardTitle,
      card_subtitle: r.card.cardSubtitle,
      card_icon: r.card.cardIcon,
      card_color: r.card.cardColor,
      card_url: r.card.cardUrl,
      card_category: r.card.cardCategory,
      data_source: r.card.dataSource,
    }));

  return ok(visible);
}
