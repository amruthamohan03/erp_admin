import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { regimeMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

// Optional ?client_id= filters regimes to the selected client's trade direction:
// a regime is kept only when its type letter(s) intersect the client's client_type
// (I = Import, E = Export, L = Local). regime_master_t.type is 1–2 letters and
// client_type is a letter string (e.g. 'IEL'); the regex char-class [<type>] matches
// when the client carries any of those letters. Drives the master-config rule that
// filters the Regime dropdown by client on the license/import/export pages (§4.5).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const clientIdRaw = new URL(req.url).searchParams.get('client_id');
  const clientId = clientIdRaw && /^\d+$/.test(clientIdRaw) ? Number(clientIdRaw) : null;

  const conditions: SQL[] = [eq(regimeMaster.display, 'Y')];
  if (clientId) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM clients_t c
      WHERE c.id = ${clientId} AND c.client_type ~ ('[' || ${regimeMaster.type} || ']')
    )`);
  }

  const rows = await db
    .select({
      id: regimeMaster.id,
      regime_name: regimeMaster.regimeName,
      type: regimeMaster.type,
      display: regimeMaster.display,
      created_at: regimeMaster.createdAt,
      updated_at: regimeMaster.updatedAt,
      created_by: regimeMaster.createdBy,
      updated_by: regimeMaster.updatedBy,
    })
    .from(regimeMaster)
    .where(and(...conditions))
    .orderBy(asc(regimeMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  regime_name: z.string().min(1).max(200),
  type: z.enum(['I', 'E', 'IE']),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return fail('Invalid input', 422, { errors: parsed.error.flatten() });
    }
    const d = parsed.data;

    const [row] = await db
      .insert(regimeMaster)
      .values({
        regimeName: d.regime_name,
        type: d.type,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: regimeMaster.id,
        regime_name: regimeMaster.regimeName,
        type: regimeMaster.type,
        display: regimeMaster.display,
        created_at: regimeMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'regime name');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[regimes.POST]', err);
    return fail('Server error', 500);
  }
}
