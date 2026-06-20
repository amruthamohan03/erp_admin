import { z } from 'zod';
import {
  quotationBodySchema,
  quotationItemSchema,
  type QuotationBody,
} from '@/lib/quotations/compute';

// The body schema lives next to compute.ts (it's part of the math
// contract). Re-exported here so route handlers + UI import from
// /schemas/ consistently with every other module.
export { quotationBodySchema, quotationItemSchema };
export type { QuotationBody };

export const quotationListQuerySchema = z.object({
  q: z.string().optional(),
  client_id: z.coerce.number().int().positive().optional(),
  kind_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type QuotationListQuery = z.infer<typeof quotationListQuerySchema>;
