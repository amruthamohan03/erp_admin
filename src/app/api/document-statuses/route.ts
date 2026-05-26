import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { documentStatusMaster } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: documentStatusMaster.id,
      document_status: documentStatusMaster.documentStatus,
      type: documentStatusMaster.type,
      display: documentStatusMaster.display,
      created_at: documentStatusMaster.createdAt,
      updated_at: documentStatusMaster.updatedAt,
      created_by: documentStatusMaster.createdBy,
      updated_by: documentStatusMaster.updatedBy,
    })
    .from(documentStatusMaster)
    .where(eq(documentStatusMaster.display, 'Y'))
    .orderBy(asc(documentStatusMaster.id));

  return ok(rows);
}

const createSchema = z.object({
  document_status: z.string().min(1).max(300),
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
      .insert(documentStatusMaster)
      .values({
        documentStatus: d.document_status,
        type: d.type,
        createdBy: session.uid,
        updatedBy: session.uid,
      })
      .returning({
        id: documentStatusMaster.id,
        document_status: documentStatusMaster.documentStatus,
        type: documentStatusMaster.type,
        display: documentStatusMaster.display,
        created_at: documentStatusMaster.createdAt,
      });

    return ok(row, 201);
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'document status');
    if (dup) return dup;
    // eslint-disable-next-line no-console
    console.error('[document-statuses.POST]', err);
    return fail('Server error', 500);
  }
}
