// GET /api/v1/outbound-messages/draft?slug=&id=&channel= — the composer
// pre-filled for one stage record: the client's contacts and the stage's manual
// communication template rendered with the record's values. Behind the mail /
// WhatsApp buttons on the licence … invoice lists. Nothing is sent; the
// operator edits it and sends through POST /api/v1/outbound-messages.
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { stageDraftQuerySchema } from '@/schemas';
import { draftStageMessage } from '@/db/queries/communicationTemplates';
import { emailConfigured } from '@/lib/messaging/email';
import { whatsappConfigured } from '@/lib/messaging/whatsapp';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission('/communications', 'add');
  if (isResponse(session)) return session;
  const q = stageDraftQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const draft = await draftStageMessage(q.slug, q.id, q.channel, session.uid);
  return ok(draft, {
    meta: { email_configured: emailConfigured(), whatsapp_configured: whatsappConfigured() },
  });
});
