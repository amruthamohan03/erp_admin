import { z } from 'zod';

// Body shape for expense_type_master_t. Name + five boolean
// applicability flags; list filter accepts any of the five flag
// columns so downstream pickers can scope to "expense types that
// apply to imports", etc.

export const expenseTypeCreateSchema = z.object({
  expense_type_name: z.string().min(1).max(300),
  is_import: z.boolean().optional(),
  is_export: z.boolean().optional(),
  is_local: z.boolean().optional(),
  is_advance: z.boolean().optional(),
  is_other: z.boolean().optional(),
});
export type ExpenseTypeCreateInput = z.infer<typeof expenseTypeCreateSchema>;

export const expenseTypeUpdateSchema = z.object({
  expense_type_name: z.string().min(1).max(300).optional(),
  is_import: z.boolean().optional(),
  is_export: z.boolean().optional(),
  is_local: z.boolean().optional(),
  is_advance: z.boolean().optional(),
  is_other: z.boolean().optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type ExpenseTypeUpdateInput = z.infer<typeof expenseTypeUpdateSchema>;

export const EXPENSE_TYPE_FLAGS = [
  'is_import',
  'is_export',
  'is_local',
  'is_advance',
  'is_other',
] as const;
export type ExpenseTypeFlag = (typeof EXPENSE_TYPE_FLAGS)[number];

export const expenseTypeListQuerySchema = z.object({
  q: z.string().optional(),
  // Single flag filter: ?flag=is_import returns rows where is_import=true.
  flag: z.enum(EXPENSE_TYPE_FLAGS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ExpenseTypeListQuery = z.infer<typeof expenseTypeListQuerySchema>;
