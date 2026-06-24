import { z } from 'zod';

export const phaseCreateSchema = z.object({
  phase_name: z.string().min(1).max(150),
  phase_code: z.string().min(1).max(50),
});
export type PhaseCreateInput = z.infer<typeof phaseCreateSchema>;

export const phaseUpdateSchema = z.object({
  phase_name: z.string().min(1).max(150).optional(),
  phase_code: z.string().min(1).max(50).optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type PhaseUpdateInput = z.infer<typeof phaseUpdateSchema>;

export const phaseListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PhaseListQuery = z.infer<typeof phaseListQuerySchema>;
