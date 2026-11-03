// PUT    /api/v1/communication-templates/{id} — change a template's wording,
//        trigger, recipients, or switch automatic sending on/off.
// DELETE /api/v1/communication-templates/{id} — soft delete (display = 'N', §4.27).
// Both audited (§4.28).
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { communicationTemplateIdSchema, communicationTemplateSchema } from '@/schemas';
import { disableCommunicationTemplate, updateCommunicationTemplate } from '@/db/queries/communicationTemplates';

const MENU = '/masters/communication-templates';
type Ctx = { params: Promise<{ id: string }> };

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission(MENU, 'edit');
  if (isResponse(session)) return session;
  const id = communicationTemplateIdSchema.parse((await params).id);
  const input = communicationTemplateSchema.parse(await req.json());
  await updateCommunicationTemplate(id, input, session.uid);
  return ok({ id });
});

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission(MENU, 'delete');
  if (isResponse(session)) return session;
  const id = communicationTemplateIdSchema.parse((await params).id);
  await disableCommunicationTemplate(id, session.uid);
  return ok({ id });
});
