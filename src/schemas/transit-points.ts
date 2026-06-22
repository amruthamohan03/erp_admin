import { z } from 'zod';

// transit_point_master_t has 6 boolean capability flags. All default to
// the same values as the schema defaults (entry/exit/loading/destination
// = true; warehouse/location = false).
const flagsShape = {
  entry_point: z.boolean().default(true),
  exit_point: z.boolean().default(true),
  loading: z.boolean().default(true),
  destination: z.boolean().default(true),
  warehouse: z.boolean().default(false),
  location: z.boolean().default(false),
};

const flagsUpdateShape = {
  entry_point: z.boolean().optional(),
  exit_point: z.boolean().optional(),
  loading: z.boolean().optional(),
  destination: z.boolean().optional(),
  warehouse: z.boolean().optional(),
  location: z.boolean().optional(),
};

export const transitPointCreateSchema = z.object({
  transit_point_name: z.string().min(1).max(255),
  ...flagsShape,
});
export type TransitPointCreateInput = z.infer<typeof transitPointCreateSchema>;

export const transitPointUpdateSchema = z.object({
  transit_point_name: z.string().min(1).max(255).optional(),
  ...flagsUpdateShape,
  display: z.enum(['Y', 'N']).optional(),
});
export type TransitPointUpdateInput = z.infer<typeof transitPointUpdateSchema>;

export const transitPointListQuerySchema = z.object({
  q: z.string().optional(),
  /** Filter to points with a specific capability flag set. */
  capability: z
    .enum(['entry_point', 'exit_point', 'loading', 'destination', 'warehouse', 'location'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type TransitPointListQuery = z.infer<typeof transitPointListQuerySchema>;
