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

// ---------------------------------------------------------------------------
// §2 step 3 — the Fiche de Calcul module's own routes.
// ---------------------------------------------------------------------------

const optionalId = z
  .union([z.literal(''), z.coerce.number().int().positive()])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : v));

/** GET /fiches — the list. */
export const ficheListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(200).optional(),
  state: z.string().trim().max(100).optional(),
});

/** GET /fiches/licenses — `current_license` keeps the licence of the fiche being edited. */
export const ficheLicensesQuerySchema = z.object({
  current_license: optionalId,
});

/** GET /fiches/files — the licence's files; `current` keeps the one already picked. */
export const ficheFilesQuerySchema = z.object({
  license_id: z.coerce
    .number({ invalid_type_error: 'License Number: choose a licence first.' })
    .int()
    .positive('License Number: choose a licence first.'),
  current: optionalId,
});

/** POST /fiches/{id}/transition — move a fiche along its workflow. */
export const ficheTransitionSchema = z.object({
  transition_key: z.string().trim().min(1, 'Choose the step to apply.').max(100),
});

/** The `{id}` of a /fiches/{id} route. */
export const ficheIdSchema = z.coerce
  .number({ invalid_type_error: 'The fiche id must be a number.' })
  .int('The fiche id must be a whole number.')
  .positive('The fiche id must be a positive whole number.');
