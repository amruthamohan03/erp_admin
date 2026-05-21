import { z } from 'zod';

export const translateBatchSchema = z.object({
  texts: z.array(z.string().max(5000)).max(200),
  target: z.string().min(2).max(8),
  source: z.string().min(2).max(8).optional(),
});

export type TranslateBatchInput = z.infer<typeof translateBatchSchema>;
