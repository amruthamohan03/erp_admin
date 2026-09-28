import { z } from 'zod';

// Body shapes for hs_green_prefix_master_t — the standing green-certificate
// rule (§4.33's sibling: config, not code).

/**
 * An HS-code prefix.
 *
 * Digits and the separators operators actually type, nothing else. The check is
 * that it contains at least one digit, because a prefix with none matches
 * nothing and a row that silently does nothing is worse than a rejected one
 * (§4.23 — say which field and why).
 */
const prefixValue = z
  .string()
  .min(1, 'Enter the digits an HS code must start with, for example 0301.')
  .max(20, 'A prefix must be 20 characters or fewer.')
  .transform((v) => v.trim())
  .refine((v) => /\d/u.test(v), {
    message: 'A prefix must contain at least one digit — for example 0301 or 03.01.',
  })
  .refine((v) => /^[\d.\s-]+$/u.test(v), {
    message: 'A prefix may contain only digits, dots, spaces and hyphens.',
  });

export const hsGreenPrefixCreateSchema = z.object({
  prefix: prefixValue,
  note: z.string().max(255, 'The note must be 255 characters or fewer.').nullish(),
});
export type HsGreenPrefixCreateInput = z.infer<typeof hsGreenPrefixCreateSchema>;

export const hsGreenPrefixUpdateSchema = z.object({
  prefix: prefixValue.optional(),
  note: z.string().max(255, 'The note must be 255 characters or fewer.').nullish(),
  display: z.enum(['Y', 'N']).optional(),
});
export type HsGreenPrefixUpdateInput = z.infer<typeof hsGreenPrefixUpdateSchema>;

export const hsGreenPrefixListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type HsGreenPrefixListQuery = z.infer<typeof hsGreenPrefixListQuerySchema>;
