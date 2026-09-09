import { NextRequest } from 'next/server';
import { and, count, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  licenseT,
  clientMaster,
  kindMaster,
  banklistMaster,
  transportModeMaster,
  typeOfGoodsMaster,
} from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import {
  EFFECTIVE_STATUS,
  licenseCardCondition,
  licenseStatusCondition,
} from '@/db/queries/licenseFilters';

// GET-only list endpoint for the licenses entity. Backs the /licenses
// list page (dashboard cards + filter bar + table) as well as the
// licenses picker used by downstream forms (imports, exports, …).

const querySchema = z.object({
  q: z.string().optional(),
  client_id: z.coerce.number().int().positive().optional(),
  // Import Tracking narrows Client → MCA Reference → License (§ import cascade).
  mca_ref: z.string().max(100).optional(),
  kind_id: z.coerce.number().int().positive().optional(),
  // Which side of the business may USE this licence, from the kind's own flags
  // (kind_master_t.use_for_import / use_for_export). Import Tracking asks for
  // 'import' so its picker offers only IMPORT DEFINITVE and IMPORT TEMPORARY —
  // by the flag, never by an id list, so re-flagging a kind is a master edit and
  // not a deploy (§4.1).
  use_for: z.enum(['import', 'export']).optional(),
  transport_mode_id: z.coerce.number().int().positive().optional(),
  // Status enum from the licenses model: ACTIVE / INACTIVE /
  // ANNULATED / MODIFIED / PROROGATED. No enum check here — unknown
  // values just return 0 rows.
  status: z.string().max(20).optional(),
  // Dashboard-card bucket. Maps card_content_id → the same status
  // buckets /api/v1/licenses/stats counts, so the card list and the
  // card number always agree.
  card: z.string().max(30).optional(),
  // license_applied_date range (matches the filter bar's Start/End Date).
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
});

export { querySchema as licenseListQuerySchema };

// card_content_id → extra WHERE condition. Mirrors the buckets in
// /api/v1/licenses/stats. 'total'/'all' (or unknown) add nothing.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = querySchema.parse({
    q: searchParams.get('q') ?? undefined,
    client_id: searchParams.get('client_id') ?? undefined,
    mca_ref: searchParams.get('mca_ref') || undefined,
    kind_id: searchParams.get('kind_id') ?? undefined,
    use_for: searchParams.get('use_for') ?? undefined,
    transport_mode_id: searchParams.get('transport_mode_id') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    card: searchParams.get('card') ?? undefined,
    start_date: searchParams.get('start_date') ?? undefined,
    end_date: searchParams.get('end_date') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });
  const offset = (q.page - 1) * q.pageSize;

  const conds: SQL[] = [eq(licenseT.display, 'Y')];
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    const orClause = or(
      ilike(licenseT.licenseNumber, like),
      ilike(licenseT.supplier, like),
      ilike(licenseT.invoiceNumber, like),
      // Both client names — the column shows the short code (§4.15), the legal
      // name stays searchable.
      ilike(clientMaster.shortName, like),
      ilike(clientMaster.companyName, like),
      ilike(banklistMaster.bankName, like),
    );
    if (orClause) conds.push(orClause);
  }
  if (q.client_id) conds.push(eq(licenseT.clientId, q.client_id));
  if (q.mca_ref) conds.push(eq(licenseT.mcaRef, q.mca_ref));
  if (q.kind_id) conds.push(eq(licenseT.kindId, q.kind_id));
  if (q.use_for) {
    // A licence with no kind is offered to neither side: it cannot be classified,
    // and a reference built from it would be missing its kind code anyway (§4.33).
    conds.push(
      q.use_for === 'import'
        ? eq(kindMaster.useForImport, true)
        : eq(kindMaster.useForExport, true),
    );
  }
  if (q.transport_mode_id) conds.push(eq(licenseT.transportModeId, q.transport_mode_id));
  if (q.status) conds.push(licenseStatusCondition(q.status));
  if (q.start_date) conds.push(gte(licenseT.licenseAppliedDate, q.start_date));
  if (q.end_date) conds.push(lte(licenseT.licenseAppliedDate, q.end_date));
  if (q.card) {
    const cardCond = licenseCardCondition(q.card);
    if (cardCond) conds.push(cardCond);
  }
  const where = and(...conds);

  const [countRow] = await db
    .select({ total: count() })
    .from(licenseT)
    .leftJoin(clientMaster, eq(clientMaster.id, licenseT.clientId))
    // Joined even though the count selects nothing from it: `use_for` filters on
    // the kind's flags, and the total has to be counted over the same rows the
    // page returns or the pagination footer contradicts the table.
    .leftJoin(kindMaster, eq(kindMaster.id, licenseT.kindId))
    .leftJoin(banklistMaster, eq(banklistMaster.id, licenseT.bankId))
    .where(where);

  const items = await db
    .select({
      id: licenseT.id,
      license_number: licenseT.licenseNumber,
      client_id: licenseT.clientId,
      mca_ref: licenseT.mcaRef,
      // §4.15 — the Client column of a list is the short code, not the legal name.
      client_name: clientMaster.shortName,
      kind_name: kindMaster.kindName,
      bank_name: banklistMaster.bankName,
      transport_mode_name: transportModeMaster.transportModeName,
      type_of_goods_name: typeOfGoodsMaster.goodsType,
      // The DERIVED status (§2.2) — EXPIRED once the date has passed. The stored
      // column is unchanged; this is what the badge and the filters agree on.
      status: EFFECTIVE_STATUS,
      supplier: licenseT.supplier,
      ref_cod: licenseT.refCod,
      invoice_number: licenseT.invoiceNumber,
      invoice_date: licenseT.invoiceDate,
      fob_declared: licenseT.fobDeclared,
      weight: licenseT.weight,
      currency_id: licenseT.currencyId,
      license_applied_date: licenseT.licenseAppliedDate,
      license_validation_date: licenseT.licenseValidationDate,
      license_expiry_date: licenseT.licenseExpiryDate,
      display: licenseT.display,
    })
    .from(licenseT)
    .leftJoin(clientMaster, eq(clientMaster.id, licenseT.clientId))
    .leftJoin(kindMaster, eq(kindMaster.id, licenseT.kindId))
    .leftJoin(banklistMaster, eq(banklistMaster.id, licenseT.bankId))
    .leftJoin(transportModeMaster, eq(transportModeMaster.id, licenseT.transportModeId))
    .leftJoin(typeOfGoodsMaster, eq(typeOfGoodsMaster.id, licenseT.typeOfGoodsId))
    .where(where)
    .orderBy(desc(licenseT.id))
    .limit(q.pageSize)
    .offset(offset);

  return ok(items, {
    meta: { total: countRow.total, page: q.page, pageSize: q.pageSize },
  });
});
