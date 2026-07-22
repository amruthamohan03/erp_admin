import { z } from 'zod';

// Boundary schemas for the /api/v1/clients endpoints. Mirrors main's
// clients_t field set: company_name + short_name + client_type are the
// required identifiers; every other field is nullable so an operator
// can save a barebones record and fill regulatory / financial /
// verification blocks later.

const optionalString = (max: number) =>
  z.string().max(max).optional().nullable();

const optionalEmail = (max: number) =>
  z
    .union([z.literal(''), z.string().email().max(max)])
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v));

const optionalIntId = z.coerce.number().int().positive().nullable().optional();

const optionalInt = z.coerce.number().int().nullable().optional();

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Must be YYYY-MM-DD')
  .nullable()
  .optional();

// Shared field set for create + update; wrapped as `.partial()` on
// the update path so PATCH-style updates can omit fields.
const clientFieldsBase = z.object({
  company_name: z.string().min(1).max(200),
  client_type: optionalString(10),
  group_company_id: optionalIntId,
  industry_type_id: optionalIntId,
  referred_by_id: optionalIntId,
  office_location_id: optionalIntId,
  address: z.string().optional().nullable(),
  phase_id: optionalIntId,
  phase_start_date: optionalDate,
  phase_end_date: optionalDate,
  contact_person: optionalString(100),
  email: optionalEmail(100),
  email_secondary: optionalEmail(100),
  phone: optionalString(20),
  phone_secondary: optionalString(20),
  id_nat_number: optionalString(50),
  id_nat_file: optionalString(255),
  id_nat_file_id: optionalIntId,
  rccm_number: optionalString(50),
  rccm_file: optionalString(255),
  rccm_file_id: optionalIntId,
  import_export_number: optionalString(50),
  import_export_validity: optionalDate,
  import_export_file: optionalString(255),
  import_export_file_id: optionalIntId,
  attestation_number: optionalString(50),
  attestation_validity: optionalDate,
  attestation_file: optionalString(255),
  attestation_file_id: optionalIntId,
  nif_number: optionalString(50),
  payment_contact_email: optionalEmail(100),
  payment_contact_phone: optionalString(20),
  payment_term: optionalString(50),
  credit_term: optionalInt,
  liquidation_paid_by: optionalIntId,
  license_cleared_by: optionalIntId,
  license_submit_to_bank: optionalIntId,
  contract_start_date: optionalDate,
  contract_validity: optionalDate,
  approval_code: optionalString(50),
  invoice_template: optionalString(1),
  verified_by_id: optionalIntId,
  verified_by_date: optionalDate,
  approved_by_id: optionalIntId,
  approved_by_date: optionalDate,
  remarks: z.string().optional().nullable(),
});

export const clientCreateSchema = clientFieldsBase.extend({
  short_name: z.string().min(1).max(3),
});
export type ClientCreateInput = z.infer<typeof clientCreateSchema>;

// short_name stays immutable post-creation (it appears on customs
// paperwork — renumbering would break audit trails). Every other
// field can change; display toggles soft-delete.
export const clientUpdateSchema = clientFieldsBase.partial().extend({
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
