// §4.7 — Zod schemas for the Payment Request MCA-reference grid.
import { z } from 'zod';

export const mcaLineSchema = z.object({
  mca_ref: z.string().trim().min(1).max(100),
  amount: z.coerce.number().finite(),
});

export const mcaSaveSchema = z.object({
  refs: z.array(mcaLineSchema).max(50),
});

export const mcaValidateSchema = z.object({
  refs: z.array(z.string()).max(200),
  pay_for: z.coerce.number().int().nullable(),
  client_id: z.coerce.number().int().nullable(),
  expense_type: z.coerce.number().int().nullable(),
  payment_id: z.coerce.number().int().nullable().optional(),
});

export type McaSaveInput = z.infer<typeof mcaSaveSchema>;
export type McaValidateInput = z.infer<typeof mcaValidateSchema>;
