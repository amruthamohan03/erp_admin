// §4.7 — Zod schemas for the PARTIELLE allocation API.
import { z } from 'zod';

export const partielleCreateSchema = z.object({
  // Optional on purpose: blank means "issue the next one from the configured
  // format" (§4.33). A required field here would force the operator to retype a
  // number the app already knows.
  partial_name: z
    .string()
    .trim()
    .max(100, 'PARTIELLE Number must be 100 characters or fewer.')
    .optional()
    .default(''),
  license_id: z.coerce.number().int().positive(),
  partial_weight: z.coerce.number().min(0),
  partial_fob: z.coerce.number().min(0),
});

export const partielleUpdateSchema = z.object({
  partial_weight: z.coerce.number().min(0),
  partial_fob: z.coerce.number().min(0),
});

export type PartielleCreateInput = z.infer<typeof partielleCreateSchema>;
export type PartielleUpdateInput = z.infer<typeof partielleUpdateSchema>;
