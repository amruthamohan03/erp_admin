import { z } from 'zod';
import { PAYMENT_STAGES } from '@/db/schema';

// Payment Request — request schemas (§4.7).

export const paymentStatusFilters = [
  'all', 'waiting_dept', 'waiting_finance', 'waiting_mgmt',
  'waiting_under_process', 'waiting_payment', 'paid', 'rejected',
] as const;

/** ISO `YYYY-MM-DD`, the shape `<input type="date">` submits and Postgres reads. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Must be a date in YYYY-MM-DD form')
  .optional();

/**
 * The filters both the list and the export accept.
 *
 * Shared so the two cannot drift: an Excel export of a filtered list has to
 * contain the rows that list was showing, and a filter the export silently
 * ignored would produce a sheet nothing on it explains (§4.15).
 */
export const paymentFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status_filter: z.enum(paymentStatusFilters).default('all'),
  /** The REQUEST date — when it was raised, not when it was approved or paid. */
  from: isoDate,
  to: isoDate,
  client_id: z.coerce.number().int().positive().optional(),
  department: z.coerce.number().int().positive().optional(),
  location_id: z.coerce.number().int().positive().optional(),
  pay_for: z.coerce.number().int().min(0).max(4).optional(),
  payment_type: z.enum(['Bank', 'Cash']).optional(),
  currency: z.coerce.number().int().positive().optional(),
  expense_type: z.coerce.number().int().positive().optional(),
});

/**
 * Both bounds are INCLUSIVE days, so a reversed pair selects nothing at all —
 * which reads as "there are no requests" rather than as a mistyped filter.
 *
 * Applied with `.refine` at each call site rather than through a shared generic
 * wrapper: a `z.ZodType<T>` parameter erases the object's precise output type,
 * so the defaults on `page` / `pageSize` came back as `number | undefined` and
 * every caller had to re-narrow what the schema had already guaranteed.
 */
const RANGE_ORDER: { message: string; path: (string | number)[] } = {
  message: 'The "to" date cannot be earlier than the "from" date.',
  path: ['to'],
};
const inOrder = (v: { from?: string | undefined; to?: string | undefined }): boolean =>
  !v.from || !v.to || v.from <= v.to;

export const paymentListQuerySchema = paymentFilterSchema
  .extend({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
  })
  .refine(inOrder, RANGE_ORDER);
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;

export const paymentExportQuerySchema = paymentFilterSchema.refine(inOrder, RANGE_ORDER);
export type PaymentExportQuery = z.infer<typeof paymentExportQuerySchema>;

// There is no re-submit schema, deliberately: re-submission is not a separate
// request. Correcting a rejected payment and saving it through the normal page
// save IS the re-submission (main's `$wasRejected` branch), and the save route
// resets the chain as part of the same UPDATE. A second endpoint would be a
// second way to do one thing (§4.10) and a state where the request is fixed but
// still sitting in Rejected because nobody pressed the other button.

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

// The default reporting period (1 January → today) lives in
// [lib/payments/dateRange.ts](src/lib/payments/dateRange.ts), NOT here. The
// browser needs it, and anything reachable from this barrel reaches
// `next/headers` through `bulk-update` → `recordAudit` — which a client
// component cannot import.
