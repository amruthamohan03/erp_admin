import { z } from 'zod';

export const transportModeCreateSchema = z.object({
  transport_mode_name: z.string().min(1).max(100),
  transport_letter: z.string().min(1).max(5),
});
export type TransportModeCreateInput = z.infer<typeof transportModeCreateSchema>;

export const transportModeUpdateSchema = z.object({
  transport_mode_name: z.string().min(1).max(100).optional(),
  transport_letter: z.string().min(1).max(5).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type TransportModeUpdateInput = z.infer<typeof transportModeUpdateSchema>;

export const transportModeListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type TransportModeListQuery = z.infer<typeof transportModeListQuerySchema>;
