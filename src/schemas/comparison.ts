import { z } from 'zod';

// §4.29 — the request every comparison dashboard (Clients, Licences, Tracking)
// accepts. One schema for all three: they compare the same four ways and differ
// only in what they measure, which the route decides (§4.10).
//
// Pure — no DB — so the browser builds its query against the same rules.

export const COMPARISON_MODES = ['period', 'client', 'direction', 'office'] as const;
export type ComparisonMode = (typeof COMPARISON_MODES)[number];

export const MAX_COMPARED = 5;

const isoDate = (label: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, `${label} must be a date (YYYY-MM-DD).`);

/** `1,4,9` → [1, 4, 9]; empty → []. */
const idList = (label: string) =>
  z
    .string()
    .optional()
    .transform((v, ctx): number[] => {
      if (!v) return [];
      const ids = v.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
      if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a comma-separated list of ids.` });
        return z.NEVER;
      }
      const unique = [...new Set(ids)];
      if (unique.length > MAX_COMPARED) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Compare at most ${MAX_COMPARED} ${label.toLowerCase()} at a time — ${unique.length} were chosen.`,
        });
        return z.NEVER;
      }
      return unique;
    });

export const comparisonQuerySchema = z
  .object({
    mode: z.enum(COMPARISON_MODES, {
      errorMap: () => ({ message: `Choose what to compare: ${COMPARISON_MODES.join(', ')}.` }),
    }),
    /** The window every non-period comparison is measured over. */
    from: isoDate('From').optional(),
    to: isoDate('To').optional(),
    /** Period mode: the two windows side by side. */
    a_from: isoDate('First period start').optional(),
    a_to: isoDate('First period end').optional(),
    b_from: isoDate('Second period start').optional(),
    b_to: isoDate('Second period end').optional(),
    client_ids: idList('Clients'),
    office_ids: idList('Offices'),
  })
  .superRefine((q, ctx) => {
    const order = (start: string | undefined, end: string | undefined, path: string, label: string): void => {
      if (start && end && start > end) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: `${label} ends before it starts — swap the two dates.` });
      }
    };
    order(q.from, q.to, 'to', 'The date range');
    order(q.a_from, q.a_to, 'a_to', 'The first period');
    order(q.b_from, q.b_to, 'b_to', 'The second period');
  });
export type ComparisonQuery = z.infer<typeof comparisonQuerySchema>;
