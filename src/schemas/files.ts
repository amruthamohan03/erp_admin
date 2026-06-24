import { z } from 'zod';

// Query schema for the files list endpoint. Filters by the entity
// attachment (entity_type + entity_id) plus an optional status
// scope. Pagination kept simple — the typical query is "files
// attached to one entity" which is well under any page boundary.

export const fileListQuerySchema = z.object({
  entity_type: z.string().max(100).optional(),
  entity_id: z.string().max(100).optional(),
  status: z
    .enum(['pending', 'committed', 'quarantined', 'deleted'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type FileListQuery = z.infer<typeof fileListQuerySchema>;
