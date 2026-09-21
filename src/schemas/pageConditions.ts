import { z } from 'zod';
import type { Predicate } from '@/lib/pages/conditions';

// §4.12 — the Conditions tab's request bodies. The predicate schema mirrors
// conditions.ts, so nothing the runtime cannot evaluate is ever stored.

const scalar = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);

const leaf = z
  .object({
    field: z.string().regex(/^[a-z_][a-z0-9_]*$/u, 'The controlling field must be a field name.'),
    eq: scalar.optional(),
    neq: scalar.optional(),
    in: z.array(scalar).min(1, 'Choose at least one value.').max(100).optional(),
    nin: z.array(scalar).min(1, 'Choose at least one value.').max(100).optional(),
    gt: z.number().optional(),
    lt: z.number().optional(),
    truthy: z.boolean().optional(),
    falsy: z.boolean().optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 1, { message: 'Choose how the controlling field is compared.' });

export const conditionPredicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    leaf,
    z.object({ all: z.array(conditionPredicateSchema).min(1).max(20) }).strict(),
    z.object({ any: z.array(conditionPredicateSchema).min(1).max(20) }).strict(),
    z.object({ not: conditionPredicateSchema }).strict(),
  ]),
) as z.ZodType<Predicate>;

/** PUT /master-page-conditions/{fieldId} — set (or clear, with null) one rule kind. */
export const fieldConditionUpdateSchema = z.object({
  key: z.enum(['visibleWhen', 'requiredWhen', 'readonlyWhen'], {
    errorMap: () => ({ message: 'Effect: choose Show / Hide, Required or Read-only.' }),
  }),
  predicate: conditionPredicateSchema.nullable(),
});
export type FieldConditionUpdate = z.infer<typeof fieldConditionUpdateSchema>;

export const pageIdQuerySchema = z.object({
  page_id: z.coerce.number().int().positive('Choose a page.'),
});

export const fieldIdSchema = z.coerce.number().int().positive('The field id must be a positive whole number.');

/** GET /master-page-conditions/values — the recorded values of one field. */
export const fieldValuesQuerySchema = z.object({
  page_id: z.coerce.number().int().positive('Choose a page.'),
  field: z.string().regex(/^[a-z_][a-z0-9_]*$/u, 'Choose a field.'),
});
