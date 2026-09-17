import { z } from 'zod';

export const translateBatchSchema = z.object({
  texts: z
    .array(z.string().max(5000, 'Each phrase must be 5000 characters or fewer.'))
    .max(200, 'A translation request carries at most 200 phrases.'),
  target: z.string().min(2, 'Target language is required.').max(8),
  source: z.string().min(2).max(8).optional(),
});

export type TranslateBatchInput = z.infer<typeof translateBatchSchema>;
