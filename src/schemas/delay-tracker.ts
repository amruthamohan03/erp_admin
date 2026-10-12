import { z } from 'zod';
import { DAY_BASES, DELAY_MODULES } from '@/db/schema/delayRuleMaster';

// Boundary schemas for the Delay Tracker (§4.7).
//
// The date-field keys are NOT enumerated here: a rule may name any date column
// on its module's table, and which columns those are is the page definition's
// business. The route checks the name against the real table instead, so a
// typo is a named 422 and `sql.identifier` never sees an unchecked string.

export const DELAY_STATUSES = [
  'not_started',
  'on_track',
  'due_soon',
  'overdue',
  'completed_on_time',
  'completed_late',
] as const;

export const delayTrackerQuerySchema = z.object({
  module: z.enum(DELAY_MODULES).optional(),
  client_id: z.coerce
    .number()
    .int('A client is identified by a whole number.')
    .positive('A client is identified by a positive number.')
    .optional(),
  status: z.enum(DELAY_STATUSES, {
    errorMap: () => ({ message: 'Unknown delay status.' }),
  }).optional(),
  include_completed: z
    .enum(['0', '1'])
    .transform((v) => v === '1')
    .optional(),
});
export type DelayTrackerQuery = z.infer<typeof delayTrackerQuerySchema>;

const dateField = z
  .string()
  .min(1, 'Choose a date field.')
  .max(60)
  .regex(/^[a-z][a-z0-9_]*$/u, 'A date field is a column name, in lower case with underscores.');

const days = z.coerce
  .number()
  .int('An allowance is a whole number of days.')
  .min(0, 'An allowance cannot be negative.')
  .max(3650, 'An allowance must be 3650 days or fewer.');

export const delayStageSchema = z.object({
  stage_key: z
    .string()
    .min(1, 'A stage needs a key.')
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/u, 'A stage key is lower case with underscores.'),
  label: z.string().min(1, 'A stage needs a name.').max(150),
  short_label: z.string().min(1, 'A stage needs a short name.').max(40),
  from_field: dateField,
  to_field: dateField,
  target_days: days,
  priority: z.boolean().default(false),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/u, 'Must be a 6-digit hex colour (e.g. #2563eb)')
    .default('#6366f1'),
  icon: z.string().min(1).max(40).default('clock'),
  sort_order: z.coerce.number().int().min(0).max(999).default(0),
});

export const delayRuleCreateSchema = z.object({
  module: z.enum(DELAY_MODULES, { errorMap: () => ({ message: 'Choose Import or Export.' }) }),
  rule_key: z
    .string()
    .min(1, 'A rule needs a key.')
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/u, 'A rule key is lower case with underscores.'),
  name: z.string().min(1, 'A rule needs a name.').max(150),
  /** Null is the module's default rule — the one a file takes when no other fits. */
  transport_letter: z
    .string()
    .length(1, 'A transport letter is a single character.')
    .nullable()
    .default(null),
  start_field: dateField,
  end_field: dateField,
  target_days: days,
  day_basis: z.enum(DAY_BASES, {
    errorMap: () => ({ message: 'Count in working days or calendar days.' }),
  }).default('working'),
  notify_days_before: z
    .array(z.coerce.number().int().min(0).max(3650))
    .max(10, 'Ten notification marks is plenty.')
    .default([3, 1]),
  notify_overdue: z.boolean().default(true),
  stages: z.array(delayStageSchema).max(40, 'Forty sub-periods is plenty.').default([]),
});
export type DelayRuleCreateInput = z.infer<typeof delayRuleCreateSchema>;

export const delayRuleUpdateSchema = delayRuleCreateSchema
  .partial()
  .extend({ display: z.enum(['Y', 'N']).optional() });
export type DelayRuleUpdateInput = z.infer<typeof delayRuleUpdateSchema>;
