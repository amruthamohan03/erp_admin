import { z } from 'zod';

const roleDashboardCardMappingRow = z.object({
  card_id: z.number().int().positive(),
  is_visible: z.boolean().default(false),
  card_order: z.number().int().min(0).default(0),
});

export const roleDashboardCardMappingPutSchema = z.object({
  role_id: z.number().int().positive(),
  mappings: z.array(roleDashboardCardMappingRow),
});
export type RoleDashboardCardMappingPutInput = z.infer<
  typeof roleDashboardCardMappingPutSchema
>;

// GET response — every active card joined with the role's mapping (if any).
// Cards with no mapping surface as is_visible=false; role_order falls back
// to the card's default_order so the matrix UI can render consistently.
export const roleDashboardCardMappingGetResponseSchema = z.object({
  role_id: z.number().int(),
  cards: z.array(
    z.object({
      card_id: z.number().int(),
      card_key: z.string(),
      card_title: z.string(),
      card_subtitle: z.string().nullable(),
      card_icon: z.string().nullable(),
      card_color: z.string().nullable(),
      card_category: z.string().nullable(),
      default_order: z.number().int(),
      is_visible: z.boolean(),
      role_order: z.number().int(),
    }),
  ),
});
export type RoleDashboardCardMappingGetResponse = z.infer<
  typeof roleDashboardCardMappingGetResponseSchema
>;
