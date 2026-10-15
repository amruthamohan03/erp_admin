import { z } from 'zod';
import { includeDisabledParam } from '@/lib/validation/includeDisabled';

export const invoiceBankCreateSchema = z.object({
  invoice_bank_name: z.string().min(1).max(255),
  invoice_bank_account_name: z.string().min(1).max(255),
  invoice_bank_account_number: z.string().min(1).max(50),
  invoice_bank_swift: z.string().max(20).nullable().optional(),
  invoice_bank_address: z.string().nullable().optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type InvoiceBankCreateInput = z.infer<typeof invoiceBankCreateSchema>;

export const invoiceBankUpdateSchema = z.object({
  invoice_bank_name: z.string().min(1).max(255).optional(),
  invoice_bank_account_name: z.string().min(1).max(255).optional(),
  invoice_bank_account_number: z.string().min(1).max(50).optional(),
  invoice_bank_swift: z.string().max(20).nullable().optional(),
  invoice_bank_address: z.string().nullable().optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type InvoiceBankUpdateInput = z.infer<typeof invoiceBankUpdateSchema>;

export const invoiceBankListQuerySchema = z.object({
  q: z.string().optional(),
  // Off by default so every dropdown reading this endpoint still sees only
  // enabled rows; the master's own screen opts in to list disabled ones too.
  include_disabled: includeDisabledParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type InvoiceBankListQuery = z.infer<typeof invoiceBankListQuerySchema>;
