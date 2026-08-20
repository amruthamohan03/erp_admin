import { z } from 'zod';
import { ACTION_KEYS } from '@/lib/actionStyles';

// §4.23 — messages name the field and the fix, so they live in the schema.
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/u, 'Colour must be a 6-digit hex value (e.g. #dc2626)');

const iconName = z
  .string()
  .min(1, 'Icon is required')
  .max(60)
  .regex(/^[A-Z][A-Za-z0-9]*$/u, 'Icon must be a lucide name in PascalCase (e.g. Trash2)');

export const actionStyleUpdateSchema = z.object({
  actions: z
    .array(
      z.object({
        action_key: z.enum(ACTION_KEYS),
        label: z.string().min(1, 'Label is required').max(60),
        color: hexColor,
        icon: iconName,
      }),
    )
    .min(1, 'At least one action is required'),
});
export type ActionStyleUpdateInput = z.infer<typeof actionStyleUpdateSchema>;
