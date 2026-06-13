// GET /api/exports/license-usage?license_id= → license weight/FOB limits, the
// amount already consumed by existing exports, and the license's auto-fill facts
// (kind/goods/transport/currency/buyer). Powers the bulk-create grid banner and
// its road-vs-wagon column choice. Read-only.
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const licenseId = parseInt(new URL(req.url).searchParams.get('license_id') ?? '', 10);
  if (Number.isNaN(licenseId) || licenseId <= 0) return fail('Invalid license_id', 400);

  const res = await db.execute(sql`
    SELECT l.kind_id, l.type_of_goods_id, l.transport_mode_id, l.currency_id, l.supplier,
           COALESCE(l.weight, 0)       AS license_weight,
           COALESCE(l.fob_declared, 0) AS license_fob,
           COALESCE((SELECT SUM(weight) FROM exports_t WHERE license_id = l.id AND display = 'Y'), 0) AS used_weight,
           COALESCE((SELECT SUM(fob)    FROM exports_t WHERE license_id = l.id AND display = 'Y'), 0) AS used_fob
    FROM licenses_t l WHERE l.id = ${licenseId} LIMIT 1
  `);
  const row = (res as unknown as { rows?: Record<string, unknown>[] }).rows?.[0];
  if (!row) return fail('License not found', 404);

  const lw = Number(row.license_weight);
  const lf = Number(row.license_fob);
  const uw = Number(row.used_weight);
  const uf = Number(row.used_fob);

  return ok({
    kind_id: row.kind_id == null ? null : Number(row.kind_id),
    type_of_goods_id: row.type_of_goods_id == null ? null : Number(row.type_of_goods_id),
    transport_mode_id: row.transport_mode_id == null ? null : Number(row.transport_mode_id),
    currency_id: row.currency_id == null ? null : Number(row.currency_id),
    buyer: row.supplier == null ? null : String(row.supplier),
    license_weight: lw,
    license_fob: lf,
    used_weight: uw,
    used_fob: uf,
    available_weight: lw - uw,
    available_fob: lf - uf,
  });
}
