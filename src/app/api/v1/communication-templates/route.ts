// GET  /api/v1/communication-templates — every stage template (Masters →
//      Communication Templates), with whether each channel is set up.
// POST /api/v1/communication-templates — add one. Audited (§4.28).
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { communicationTemplateSchema } from '@/schemas';
import { createCommunicationTemplate, listCommunicationTemplates } from '@/db/queries/communicationTemplates';
import { emailConfigured, emailProvider } from '@/lib/messaging/email';
import { whatsappConfigured } from '@/lib/messaging/whatsapp';

const MENU = '/masters/communication-templates';

export const GET = withErrorHandler(async () => {
  const session = await requirePermission(MENU, 'view');
  if (isResponse(session)) return session;
  return ok(await listCommunicationTemplates(), {
    meta: {
      email_configured: emailConfigured(),
      email_provider: emailProvider(),
      whatsapp_configured: whatsappConfigured(),
    },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(MENU, 'add');
  if (isResponse(session)) return session;
  const input = communicationTemplateSchema.parse(await req.json());
  const id = await createCommunicationTemplate(input, session.uid);
  return ok({ id }, 201);
});
