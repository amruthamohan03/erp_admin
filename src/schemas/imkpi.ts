import { z } from 'zod';

// Import Delay KPI — filter + drill-down query schemas (§4.7).
export const imkpiFilterSchema = z.object({
  client_id: z.string().trim().default('all'),
  clearance_type: z.string().trim().default(''),
  start_date: z.string().trim().default(''),
  end_date: z.string().trim().default(''),
});
export type ImkpiFilterInput = z.infer<typeof imkpiFilterSchema>;

export const imkpiStageQuerySchema = imkpiFilterSchema.extend({
  stage: z.string().trim().min(1),
  status_filter: z.enum(['', 'on_time', 'delayed', 'pending']).default(''),
});
