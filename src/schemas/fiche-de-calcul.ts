import { z } from 'zod';
import { ficheDeCalculEntitySchema } from '@/lib/ficheDeCalcul';

// Boundary schemas for the /api/v1/fiche-de-calcul/calculate endpoint.
// The entity shape itself lives next to computeFiche (it's also a code
// contract the JSON Logic formulas reference) — re-exported here so route
// handler + UI consume one source of truth.

export const calculateFicheRequestSchema = z.object({
  entity: ficheDeCalculEntitySchema,
  ruleKeys: z.array(z.string().min(1)).min(1).max(20),
  /** ISO date 'YYYY-MM-DD'. Defaults to today server-side. */
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'asOf must be ISO YYYY-MM-DD')
    .optional(),
});

export type CalculateFicheRequest = z.infer<typeof calculateFicheRequestSchema>;

const lineSchema = z.object({
  ruleKey: z.string(),
  name: z.string(),
  scope: z.string().nullable(),
  value: z.number().nullable(),
  error: z.string().optional(),
});

export const calculateFicheResponseSchema = z.object({
  entity: ficheDeCalculEntitySchema,
  asOf: z.string(),
  lines: z.array(lineSchema),
  total: z.number(),
});

export { ficheDeCalculEntitySchema };
