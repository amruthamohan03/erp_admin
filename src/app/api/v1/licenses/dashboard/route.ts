import { NextRequest } from 'next/server';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { getLicenseDashboard } from '@/db/queries/licenseDashboard';
import type { LicenseUseFor } from '@/db/queries/licenseFilters';

// GET /api/v1/licenses/dashboard[?use_for=import|export]
//
// KPIs, the expiry outlook, the import/export split, a twelve-month trend, what
// lapses next, and the busiest clients and kinds — every figure a SQL aggregate
// over live rows (§4.29).
//
// `use_for` narrows every figure to one side of the business, which is what the
// Import and Export Licence dashboards each pass. Anything else — including an
// absent parameter — reports on the whole book, so an older caller keeps the
// behaviour it had.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;
  const raw = req.nextUrl.searchParams.get('use_for');
  const useFor: LicenseUseFor | undefined =
    raw === 'import' || raw === 'export' ? raw : undefined;
  return ok(await getLicenseDashboard(useFor));
});
