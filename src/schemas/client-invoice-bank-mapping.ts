import { z } from 'zod';

// §4.7 — the boundary for Client → Invoice Bank. Messages name the field and
// the fix (§4.23); "Expected number, received null" tells an operator nothing.

const mappingRow = z.object({
  invoice_bank_id: z
    .number({ invalid_type_error: 'Each row needs an invoice bank.' })
    .int()
    .positive('Invoice Bank must be an existing bank.'),
  is_assigned: z.boolean().default(false),
  is_default: z.boolean().default(false),
});

export const clientInvoiceBankMappingPutSchema = z
  .object({
    client_id: z
      .number({ invalid_type_error: 'Select a client before saving.' })
      .int()
      .positive('Select a client before saving.'),
    mappings: z.array(mappingRow),
  })
  // Caught here rather than at the unique index, so the operator gets a sentence
  // instead of a constraint name. The index still exists and is still the
  // authority — this is the readable half of the same rule (§4.37's "guard every
  // door, from one shared function", applied across the two layers).
  .refine(
    (v) => v.mappings.filter((m) => m.is_assigned && m.is_default).length <= 1,
    { message: 'Only one bank can be the default for a client.', path: ['mappings'] },
  )
  // A default that is not assigned is a contradiction the UI cannot produce but
  // an API caller can, and it would store a default nobody can invoice through.
  .refine(
    (v) => v.mappings.every((m) => !m.is_default || m.is_assigned),
    {
      message: 'A bank must be assigned to the client before it can be the default.',
      path: ['mappings'],
    },
  );
export type ClientInvoiceBankMappingPutInput = z.infer<
  typeof clientInvoiceBankMappingPutSchema
>;

// GET response — every active invoice bank joined with this client's mapping.
// A bank with no row comes back unassigned so the matrix renders consistently.
export const clientInvoiceBankMappingGetResponseSchema = z.object({
  client_id: z.number().int(),
  /** True when the client has banks assigned but none marked default. */
  needs_default: z.boolean(),
  banks: z.array(
    z.object({
      invoice_bank_id: z.number().int(),
      invoice_bank_name: z.string(),
      invoice_bank_account_name: z.string().nullable(),
      invoice_bank_account_number: z.string().nullable(),
      invoice_bank_swift: z.string().nullable(),
      is_assigned: z.boolean(),
      is_default: z.boolean(),
    }),
  ),
});
export type ClientInvoiceBankMappingGetResponse = z.infer<
  typeof clientInvoiceBankMappingGetResponseSchema
>;
