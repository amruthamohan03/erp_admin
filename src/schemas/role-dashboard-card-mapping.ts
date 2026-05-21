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
