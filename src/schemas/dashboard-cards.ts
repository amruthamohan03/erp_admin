import { z } from 'zod';

export const dashboardCardCreateSchema = z.object({
  card_key: z.string().min(1).max(50),
  card_content_id: z.string().min(1).max(50),
  card_title: z.string().min(1).max(100),
  card_subtitle: z.string().max(100).optional().nullable(),
  card_icon: z.string().max(50).optional().nullable(),
  card_color: z.string().max(30).optional().nullable(),
  card_url: z.string().max(255).optional().nullable(),
  card_order: z.number().int().min(0).default(0),
  card_category: z.string().max(50).optional().nullable(),
  menu_id: z.number().int().positive().nullable().optional(),
  data_source: z.string().max(255).optional().nullable(),
});
export type DashboardCardCreateInput = z.infer<typeof dashboardCardCreateSchema>;

export const dashboardCardUpdateSchema = z.object({
  card_key: z.string().min(1).max(50).optional(),
  card_content_id: z.string().min(1).max(50).optional(),
  card_title: z.string().min(1).max(100).optional(),
  card_subtitle: z.string().max(100).optional().nullable(),
  card_icon: z.string().max(50).optional().nullable(),
  card_color: z.string().max(30).optional().nullable(),
  card_url: z.string().max(255).optional().nullable(),
  card_order: z.number().int().min(0).optional(),
  card_category: z.string().max(50).optional().nullable(),
  menu_id: z.number().int().positive().nullable().optional(),
  data_source: z.string().max(255).optional().nullable(),
  display: z.enum(['Y', 'N']).optional(),
});
export type DashboardCardUpdateInput = z.infer<typeof dashboardCardUpdateSchema>;

// Superset shape — /dashboard-cards (admin list) returns everything,
// /dashboard-cards/me strips menu/order/display since users don't need
// to know about admin internals. Optional/nullable fields document that.
export const dashboardCardResponseSchema = z.object({
  id: z.number().int(),
  card_key: z.string(),
  card_content_id: z.string(),
  card_title: z.string(),
  card_subtitle: z.string().nullable(),
  card_icon: z.string().nullable(),
  card_color: z.string().nullable(),
  card_url: z.string().nullable(),
  card_category: z.string().nullable(),
  data_source: z.string().nullable(),
  card_order: z.number().int().optional(),
  menu_id: z.number().int().nullable().optional(),
  menu_name: z.string().nullable().optional(),
  display: z.enum(['Y', 'N']).optional(),
});
export type DashboardCardResponse = z.infer<typeof dashboardCardResponseSchema>;
