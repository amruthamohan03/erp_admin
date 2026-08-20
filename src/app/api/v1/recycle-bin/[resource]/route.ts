// GET /api/v1/recycle-bin/{resource}?page=&pageSize=&q=
// The soft-deleted rows of one resource.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, ForbiddenError } from '@/lib/errors';
import { getSoftDeleteResource, listDeleted } from '@/db/queries/softDelete';
import { checkPermission } from '@/lib/auth/permissions';

const querySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

type Ctx = { params: Promise<{ resource: string }> };

export const GET = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { resource: key } = await params;
  const resource = getSoftDeleteResource(key);
  if (!resource) throw new BadRequestError(`Unknown recycle-bin resource: ${key}`);

  // Reading the bin needs at least one of the two operations it offers; a role
  // that can do neither has no reason to see deleted rows.
  const [canRestore, canPermanentDelete] = await Promise.all([
    checkPermission(session, resource.menu, 'restore'),
    checkPermission(session, resource.menu, 'permanentDelete'),
  ]);
  if (!canRestore && !canPermanentDelete) {
    throw new ForbiddenError(`You do not have permission to manage deleted ${resource.label}.`);
  }

  const { searchParams } = new URL(req.url);
  const q = querySchema.parse({
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });

  const { items, total } = await listDeleted(resource, q);
  return ok(items, {
    meta: {
      total,
      page: q.page,
      pageSize: q.pageSize,
      label: resource.label,
      can_restore: canRestore,
      can_permanent_delete: canPermanentDelete,
    },
  });
});
