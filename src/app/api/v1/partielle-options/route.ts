// GET /api/v1/partielle-options?license_id= — PARTIELLE allotments for the import
// form's "Inspection Reports (PARTIELLE)" dropdown. The transaction-pages select
// stores each option's `id`, and imports link to an allotment by NAME
// (imports_t.inspection_reports), so `id` here IS the partial_name string. The
// label shows remaining weight/FOB so operators pick like the legacy dropdown.
// Scoped to the chosen licence via the field's optionsParams { license_id }.
import { type NextRequest } from 'next/server';
import { ok, isResponse, requireAuth, withErrorHandler } from '@/lib/api';
import { listForLicense } from '@/db/queries/partielle';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const licenseId = Number(req.nextUrl.searchParams.get('license_id'));
  if (!Number.isInteger(licenseId) || licenseId <= 0) return ok([]);

  const rows = await listForLicense(licenseId);
  return ok(
    rows.map((r) => ({
      id: r.partial_name, // value written to inspection_reports (name string link)
      label: `${r.partial_name} — rem ${r.remaining_weight.toLocaleString('en-US')} KG / ${r.remaining_fob.toLocaleString('en-US')} FOB`,
    })),
  );
});
