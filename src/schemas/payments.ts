import { z } from 'zod';
import { PAYMENT_STAGES } from '@/db/schema';

// Payment Request — request schemas (§4.7).

export const paymentStatusFilters = [
  'all', 'waiting_dept', 'waiting_finance', 'waiting_mgmt',
  'waiting_under_process', 'waiting_payment', 'paid', 'rejected',
] as const;

export const paymentListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status_filter: z.enum(paymentStatusFilters).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;

// Approve one stage. `cash_collector` is required by the paid stage; extra
// per-stage fields (chargeback for dept) ride along and are ignored elsewhere.
export const paymentApproveSchema = z.object({
  stage: z.enum(PAYMENT_STAGES),
  cash_collector: z.string().trim().max(100).optional(),
  chargeback: z.coerce.number().min(0).optional(),
});
export type PaymentApprove = z.infer<typeof paymentApproveSchema>;

export const paymentRejectSchema = z.object({
  stage: z.enum(PAYMENT_STAGES),
  reason: z.string().trim().min(1, 'A reason is required').max(1000),
});
export type PaymentReject = z.infer<typeof paymentRejectSchema>;
