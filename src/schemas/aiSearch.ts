import { z } from 'zod';

// AI Search (lib/ai/search.ts, db/queries/aiSearch.ts).

export const AI_QUESTION_MAX = 500;

/**
 * POST /ai-search — one question in plain language. With `conversation_id` it
 * continues that conversation (one of the caller's own); without, it starts one.
 */
export const aiSearchRequestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, 'Question must be at least 3 characters — e.g. "status of NMI-IDCOR26-0001".')
    .max(AI_QUESTION_MAX, `Question must be ${AI_QUESTION_MAX} characters or fewer.`),
  conversation_id: z
    .number({ invalid_type_error: 'Conversation must be a conversation number.' })
    .int()
    .positive()
    .nullish(),
});
export type AiSearchRequest = z.infer<typeof aiSearchRequestSchema>;

/** GET /ai-search/conversations — my conversations, optionally searched by title. */
export const aiConversationListQuerySchema = z.object({
  q: z.string().trim().max(120, 'Search must be 120 characters or fewer.').optional(),
});

// The arguments the model may pass to each lookup. The model is a client like
// any other: what it sends is parsed at the boundary before it reaches a query.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Dates must be YYYY-MM-DD.');
const limit = z.number().int().min(1).max(25).optional();
const client = z.string().trim().max(200).nullish();

export const aiFindRecordsInput = z.object({ reference: z.string().trim().min(2).max(100) });

export const aiLicenseQueryInput = z.object({
  side: z.enum(['import', 'export', 'both']).optional(),
  filter: z.enum(['all', 'active', 'expiring', 'expired', 'annulated', 'modified', 'prorogated', 'inactive']).optional(),
  client,
  expired_within_days: z.number().int().min(1).max(3650).nullish(),
  expiring_within_days: z.number().int().min(1).max(3650).nullish(),
  limit,
});

export const aiLicenseSummaryInput = z.object({ side: z.enum(['import', 'export', 'both']).optional(), client });

export const aiTrackingQueryInput = z.object({
  module: z.enum(['import', 'export', 'local']),
  client,
  status: z.string().trim().max(100).nullish(),
  created_from: isoDate.nullish(),
  created_to: isoDate.nullish(),
  limit,
});

export const aiPaymentSummaryInput = z.object({ client });

export const aiRecordDetailsInput = z.object({
  module: z.enum([
    'import_license',
    'export_license',
    'import',
    'export',
    'local',
    'import_invoice',
    'export_invoice',
    'payment',
  ]),
  id: z.number().int().positive(),
});
