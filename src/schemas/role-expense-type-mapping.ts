import { z } from 'zod';

// §4.7 — the boundary schema for Role → Expense Type mapping.
//
// Messages name the field and the fix (§4.23): "role_id" reaching an operator
// as "Expected number, received null" tells them nothing they can act on.

const roleExpenseTypeMappingRow = z.object({
  expense_type_id: z
    .number({ invalid_type_error: 'Each row needs an expense type.' })
    .int()
    .positive('Expense Type must be an existing expense type.'),
  is_allowed: z.boolean().default(false),
});

export const roleExpenseTypeMappingPutSchema = z.object({
  role_id: z
    .number({ invalid_type_error: 'Select a role before saving.' })
    .int()
    .positive('Select a role before saving.'),
  mappings: z.array(roleExpenseTypeMappingRow),
});
export type RoleExpenseTypeMappingPutInput = z.infer<
  typeof roleExpenseTypeMappingPutSchema
>;

// GET response — every active expense type joined with the role's mapping (if
// any). A type with no row surfaces as is_allowed=false so the matrix renders
// consistently; `unrestricted` says whether the role has any rows at all, which
// is what decides if the picker is filtered for that role.
export const roleExpenseTypeMappingGetResponseSchema = z.object({
  role_id: z.number().int(),
  unrestricted: z.boolean(),
  expense_types: z.array(
    z.object({
      expense_type_id: z.number().int(),
      expense_type_name: z.string(),
      is_import: z.boolean(),
      is_export: z.boolean(),
      is_local: z.boolean(),
      is_advance: z.boolean(),
      is_other: z.boolean(),
      is_allowed: z.boolean(),
    }),
  ),
});
export type RoleExpenseTypeMappingGetResponse = z.infer<
  typeof roleExpenseTypeMappingGetResponseSchema
>;
