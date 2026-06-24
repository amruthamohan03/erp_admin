import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { filesT } from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { getObject } from '@/lib/files';

// GET /api/v1/files/{id}/view
// Streams the bytes for a stored file with the appropriate
// Content-Type + Content-Disposition. Auth-gated — operators can
// link this freely in the UI; the request must carry the session
// cookie to resolve.
//
// Deleted (`status='deleted'`) rows return 404. Quarantined files
// return 403 to surface the malware-scan reject distinctly from
// "not found".

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(
  async (_req: NextRequest, { params }: Ctx) => {
    const session = await requireAuth();
    if (isResponse(session)) return session;

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid id');
    }

    const [row] = await db
      .select({
        id: filesT.id,
        key: filesT.key,
        mime: filesT.mime,
        original_name: filesT.originalName,
        status: filesT.status,
      })
      .from(filesT)
      .where(eq(filesT.id, id))
      .limit(1);

    if (!row || row.status === 'deleted') {
      throw new NotFoundError('File not found');
    }
    if (row.status === 'quarantined') {
      return new NextResponse('Quarantined', { status: 403 });
    }

    const bytes = await getObject(row.key);

    const filename = row.original_name.replace(/"/g, '_');
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': row.mime ?? 'application/octet-stream',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  },
);
