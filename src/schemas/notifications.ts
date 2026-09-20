import { z } from 'zod';
import { NOTIFICATION_KINDS, NOTIFICATION_PRIORITIES } from '@/db/schema/notifications';

// The notification inbox, role messages and the event master (db/queries/notifications.ts).

const kind = z.enum(NOTIFICATION_KINDS, { errorMap: () => ({ message: 'Show: choose Messages or Alerts.' }) });
const priority = z.enum(NOTIFICATION_PRIORITIES, { errorMap: () => ({ message: 'Priority must be Normal or High.' }) });

/** GET /notifications */
export const inboxQuerySchema = z.object({
  kind: kind.optional(),
  unread: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** POST /notifications/read — the given ones, or all (of one kind). */
export const markReadSchema = z
  .object({
    ids: z.array(z.coerce.number().int().positive()).max(500).optional(),
    all: z.boolean().optional(),
    kind: kind.optional(),
  })
  .refine((v) => v.all === true || (v.ids?.length ?? 0) > 0, {
    message: 'Choose the notifications to mark read, or mark them all.',
    path: ['ids'],
  });

/** POST /messages — a message from the sender's role to one or more roles. */
export const sendMessageSchema = z.object({
  role_ids: z
    .array(z.coerce.number().int().positive())
    .min(1, 'To: choose at least one role.')
    .max(100, 'To: send to at most 100 roles at once.'),
  subject: z.string().trim().min(1, 'Subject is required.').max(200, 'Subject must be 200 characters or fewer.'),
  body: z.string().trim().min(1, 'Message is required.').max(4000, 'Message must be 4000 characters or fewer.'),
  priority: priority.default('normal'),
});
export type SendMessageBody = z.infer<typeof sendMessageSchema>;

/** PUT /notification-events/{id} — what an event says and to whom. */
export const notificationEventUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(150, 'Name must be 150 characters or fewer.'),
  title_template: z.string().trim().min(1, 'Title is required.').max(200, 'Title must be 200 characters or fewer.'),
  message_template: z.string().trim().min(1, 'Message is required.').max(2000, 'Message must be 2000 characters or fewer.'),
  link_template: z
    .string()
    .trim()
    .max(300, 'Link must be 300 characters or fewer.')
    .refine((v) => v === '' || v.startsWith('/'), 'Link must be a page of this app, starting with / (e.g. /payments).')
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null),
  notify_creator: z.boolean(),
  priority,
  display: z.enum(['Y', 'N']),
  role_ids: z.array(z.coerce.number().int().positive()).max(200),
});

/** A /notification-events/{id} path id. */
export const notificationEventIdSchema = z.coerce
  .number({ invalid_type_error: 'The event id must be a number.' })
  .int()
  .positive('The event id must be a positive whole number.');
