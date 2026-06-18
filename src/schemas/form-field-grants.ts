import { z } from 'zod';

// Boundary schemas for the /api/v1/form-field-grants endpoints.
//
// PUT semantics — "default = edit" means an explicit row is only kept for
// view/hidden permissions. The server-side handler deletes any (field, role)
// row whose submitted permission is 'edit' so the table stays free of
// no-op grants.

const permissionEnum = z.enum(['view', 'edit', 'hidden']);
export type FieldPermission = z.infer<typeof permissionEnum>;

const grantRow = z.object({
  field_id: z.number().int().positive(),
  permission: permissionEnum,
});

export const formFieldGrantsPutSchema = z.object({
  form_id: z.number().int().positive(),
  role_id: z.number().int().positive(),
  grants: z.array(grantRow),
});
export type FormFieldGrantsPutInput = z.infer<typeof formFieldGrantsPutSchema>;

// GET response — every field of the form joined with its (possibly absent)
// grant for the queried role. Absence surfaces as permission='edit' so the
// UI can render the matrix without special-casing missing rows.
export const formFieldGrantsGetResponseSchema = z.object({
  form_id: z.number().int(),
  role_id: z.number().int(),
  form: z.object({
    id: z.number().int(),
    formKey: z.string(),
    name: z.string(),
    entityType: z.string(),
  }),
  fields: z.array(
    z.object({
      field_id: z.number().int(),
      field_key: z.string(),
      label: z.string(),
      field_type: z.string(),
      required: z.boolean(),
      display_order: z.number().int(),
      permission: permissionEnum,
    }),
  ),
});
export type FormFieldGrantsGetResponse = z.infer<
  typeof formFieldGrantsGetResponseSchema
>;
