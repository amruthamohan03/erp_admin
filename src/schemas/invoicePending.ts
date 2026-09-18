// §4.7 — hold a pending tracking file back from invoicing, or release it.
// Shared by the export and import invoice modules' pending routes.
import { z } from 'zod';

export const pendingFileToggleSchema = z
  .object({
    disabled: z.boolean(),
    remark: z.string().trim().max(500, 'Reason must be 500 characters or fewer.').nullable().optional(),
  })
  .refine((v) => !v.disabled || !!v.remark, {
    path: ['remark'],
    message: 'Reason is required to disable a file — say why it is being held back from invoicing.',
  });

export type PendingFileToggle = z.infer<typeof pendingFileToggleSchema>;
