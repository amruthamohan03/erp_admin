import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { createCase, listCases } from '@/modules/case-runtime';

// GET /api/v1/cases/{templateKey}?page=&pageSize=&state=
// Paginated list of rows from template.target_table. Errors:
//   401 — unauthenticated
//   404 — template not found

// POST /api/v1/cases/{templateKey}
// Generic create endpoint — delegates to case-runtime which validates the
// body against the form_definition's Zod schema before inserting into
// template.target_table. Errors:
//   401 — unauthenticated
//   404 — template/form/workflow not found
//   422 — body or values fail validation

const bodySchema = z.object({
  values: z.record(z.string(), z.unknown()),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  state: z.string().optional(),
});

type Ctx = { params: Promise<{ templateKey: string }> };

export const GET = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { templateKey } = await params;
  const { searchParams } = new URL(req.url);
  const q = listQuerySchema.parse({
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
    state: searchParams.get('state') ?? undefined,
  });

  const result = await listCases({
    templateKey,
    page: q.page,
    pageSize: q.pageSize,
    state: q.state,
  });
  return ok(result.items, {
    meta: { total: result.total, page: result.page, pageSize: result.pageSize },
  });
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { templateKey } = await params;
  const { values } = bodySchema.parse(await req.json());

  const result = await createCase({
    templateKey,
    actorUserId: session.uid,
    values,
  });
  return ok(result, 201);
});
