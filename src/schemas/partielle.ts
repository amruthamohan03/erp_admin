// §4.7 — Zod schemas for the PARTIELLE allocation API.
import { z } from 'zod';

export const partielleCreateSchema = z.object({
  partial_name: z.string().trim().min(1).max(100),
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
