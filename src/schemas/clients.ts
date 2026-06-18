import { z } from 'zod';

// Boundary schemas for the /api/v1/clients endpoints. `client_code` is the
// only required identifier — name/legal_name/email/phone/address/tax_id are
// optional in the DB and stay optional here so a partial onboarding still
// produces a usable client row.

const optionalString = (max: number) =>
  z.string().max(max).optional().nullable();

export const clientCreateSchema = z.object({
  client_code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  legal_name: optionalString(255),
  email: z.string().email().max(100).optional().nullable(),
  phone: optionalString(30),
  address: z.string().optional().nullable(),
  tax_id: optionalString(50),
});
export type ClientCreateInput = z.infer<typeof clientCreateSchema>;

// client_code stays immutable post-creation (it appears on customs paperwork
// — renumbering it would break audit trails). Every other field can change.
export const clientUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  legal_name: optionalString(255),
  email: z.string().email().max(100).optional().nullable(),
  phone: optionalString(30),
  address: z.string().optional().nullable(),
  tax_id: optionalString(50),
  display: z.enum(['Y', 'N']).optional(),
});
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;

export const clientListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ClientListQuery = z.infer<typeof clientListQuerySchema>;

export const clientStatsResponseSchema = z.object({
  total: z.number().int(),
  this_month: z.number().int(),
  today: z.number().int(),
  with_email: z.number().int(),
  with_phone: z.number().int(),
  with_tax_id: z.number().int(),
});
export type ClientStatsResponse = z.infer<typeof clientStatsResponseSchema>;
