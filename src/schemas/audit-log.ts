import { z } from 'zod';

// §4.28 — the audit trail is read-only, so there is no create/update schema here.
// Only the query shape the list, stats and export routes all share.

export const AUDIT_MENU = '/audit-log';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Date must be in YYYY-MM-DD format.');

export const auditListQuerySchema = z.object({
  q: z.string().max(200).optional(),
  actorId: z.coerce.number().int().positive().optional(),
  module: z.string().max(100).optional(),
  action: z.string().max(50).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

/** Pulls the shared filter params off a URL — one parser for all four routes. */
export function parseAuditQuery(searchParams: URLSearchParams): AuditListQuery {
  const pick = (k: string) => searchParams.get(k) || undefined;
  return auditListQuerySchema.parse({
    q: pick('q'),
    actorId: pick('actorId'),
    module: pick('module'),
    action: pick('action'),
    from: pick('from'),
    to: pick('to'),
    page: pick('page'),
    pageSize: pick('pageSize'),
  });
}
