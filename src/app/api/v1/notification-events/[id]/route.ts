// PUT /api/v1/notification-events/{id} — change an event's wording, its roles,
// whether the record's creator is told, or switch it off. The event key is what
// the code raises and is not editable. Audited (§4.28).
import { NextRequest } from 'next/server';
import { ok, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { notificationEventIdSchema, notificationEventUpdateSchema } from '@/schemas';
import { updateNotificationEvent } from '@/db/queries/notifications';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const session = await requirePermission('/masters/notification-events', 'edit');
  if (isResponse(session)) return session;
  const id = notificationEventIdSchema.parse((await params).id);
  const body = notificationEventUpdateSchema.parse(await req.json());
  await updateNotificationEvent(id, { ...body, role_ids: [...new Set(body.role_ids)] }, session.uid);
  return ok({ id });
});
