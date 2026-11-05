import { z } from 'zod';

// Communication → Live Chat (db/queries/chat.ts).

/** The longest message — matches chat_message_t_body_length. */
export const CHAT_MESSAGE_MAX = 2000;

/** POST /chat/messages — one message to one user. */
export const sendChatMessageSchema = z.object({
  to: z.coerce.number().int().positive('To: choose who to send the message to.'),
  body: z
    .string()
    .trim()
    .min(1, 'Message is required.')
    .max(CHAT_MESSAGE_MAX, `Message must be ${CHAT_MESSAGE_MAX} characters or fewer.`),
});
export type SendChatMessageBody = z.infer<typeof sendChatMessageSchema>;

/**
 * GET /chat/messages?with=&after= — one conversation. `after` asks only for
 * messages newer than the last one the screen already holds, so a poll carries
 * what changed rather than the whole thread.
 */
export const chatThreadQuerySchema = z.object({
  with: z.coerce.number().int().positive('Choose who the conversation is with.'),
  after: z.coerce.number().int().nonnegative().optional(),
});
