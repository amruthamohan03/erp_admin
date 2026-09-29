import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoiceTemplateMaster, type InvoiceTemplateInsert } from '@/db/schema';
import { ok, fail, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { uniqueViolationResponse } from '@/lib/api/uniqueness';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { invoiceTemplateUpdateSchema } from '@/schemas';
import { clearDefault } from '../route';

type Ctx = { params: Promise<{ id: string }> };

function parseId(idStr: string): number {
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Invalid id');
  return id;
}

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const [row] = await db
    .select()
    .from(invoiceTemplateMaster)
    .where(eq(invoiceTemplateMaster.id, parseId(idStr)))
    .limit(1);

  if (!row) throw new NotFoundError();
  return ok({
    id: row.id,
    template_code: row.templateCode,
    template_name: row.templateName,
    description: row.description,
    layout: row.layout,
    options: row.options,
    is_default: row.isDefault,
    display: row.display,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  });
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseId(idStr);
  const data = invoiceTemplateUpdateSchema.parse(await req.json());

  const patch: Partial<InvoiceTemplateInsert> = {};
  if (data.template_code !== undefined) patch.templateCode = data.template_code;
  if (data.template_name !== undefined) patch.templateName = data.template_name.trim();
  if (data.description !== undefined) patch.description = data.description?.trim() || null;
  if (data.layout !== undefined) patch.layout = data.layout;
  // Replaced wholesale, not merged: the form always submits the complete option
  // set, and a merge would make an option impossible to turn back off.
  if (data.options !== undefined) patch.options = data.options;
  if (data.is_default !== undefined) patch.isDefault = data.is_default;
  if (data.display !== undefined) patch.display = data.display;

  if (Object.keys(patch).length === 0) throw new BadRequestError('Nothing to update');
  patch.updatedBy = session.uid;
  patch.updatedAt = sql`CURRENT_TIMESTAMP` as unknown as Date;

  try {
    const row = await db.transaction(async (tx) => {
      if (data.is_default === true) await clearDefault(tx, id);

      const [updated] = await tx
        .update(invoiceTemplateMaster)
        .set(patch)
        .where(eq(invoiceTemplateMaster.id, id))
        .returning({ id: invoiceTemplateMaster.id });
      return updated;
    });

    if (!row) throw new NotFoundError();
    return ok({ id: row.id });
  } catch (err) {
    const dup = uniqueViolationResponse(err, 'Template Code');
    if (dup) return dup;
    throw err;
  }
});

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { id: idStr } = await params;
  const id = parseId(idStr);

  const [row] = await db
    .select({
      isDefault: invoiceTemplateMaster.isDefault,
      code: invoiceTemplateMaster.templateCode,
    })
    .from(invoiceTemplateMaster)
    .where(eq(invoiceTemplateMaster.id, id))
    .limit(1);
  if (!row) throw new NotFoundError();

  // §4.37 — refuse with the reason named rather than leaving the system with no
  // default. Every invoice that names no template falls back to this row, so
  // disabling it silently would change what those invoices print.
  if (row.isDefault) {
    return fail(
      `“${row.code}” is the default template, so it cannot be disabled. Make another template the default first.`,
      409,
      { field: 'is_default', code: 'is_default' },
    );
  }

  // Invoices already drawn with it keep their code (§4.27 — soft-deleted rows
  // stay readable to history), and a reprint falls back to the default.
  const [updated] = await db
    .update(invoiceTemplateMaster)
    .set({
      display: 'N',
      updatedBy: session.uid,
      updatedAt: sql`CURRENT_TIMESTAMP` as unknown as Date,
    })
    .where(eq(invoiceTemplateMaster.id, id))
    .returning({ id: invoiceTemplateMaster.id });

  return ok({ id: updated.id });
});
