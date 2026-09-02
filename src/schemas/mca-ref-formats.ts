import { z } from 'zod';
import {
  MCA_REF_SEGMENT_TYPES,
  MCA_REF_TARGET_KEYS,
  MCA_REF_TARGETS,
  validateSegments,
  type McaRefSegment,
} from '@/lib/mcaRefFormat';

// §4.7 — the boundary schema for the reference-format setup. Messages are written
// here rather than in the handler so the setup screen and the server reject the
// same thing in the same words (§4.23).

const segmentSchema = z.object({
  type: z.enum(MCA_REF_SEGMENT_TYPES, {
    errorMap: () => ({ message: `Segment type must be one of: ${MCA_REF_SEGMENT_TYPES.join(', ')}.` }),
  }),
  // A separator is deliberately allowed to be '' — that is what glues IDCOR26
  // together out of four separate segments.
  separator: z.string().max(5, 'A separator can be at most 5 characters.').optional(),
  value: z.string().max(20, 'Fixed text can be at most 20 characters.').optional(),
  width: z.number().int().min(1, 'The number needs at least 1 digit.').max(10, 'The number can be at most 10 digits.').optional(),
  digits: z.union([z.literal(2), z.literal(4)], {
    errorMap: () => ({ message: 'A year is either 2 digits (26) or 4 (2026).' }),
  }).optional(),
  letters: z.number().int().min(1, 'Keep at least 1 letter.').max(20, 'Keep at most 20 letters.').optional(),
});

export const mcaRefFormatUpdateSchema = z
  .object({
    target_key: z.enum(MCA_REF_TARGET_KEYS, {
      errorMap: () => ({ message: 'That reference does not exist. Formats can be edited, not invented.' }),
    }),
    format_name: z.string().min(1, 'Give the format a name.').max(150, 'The name must be 150 characters or fewer.'),
    segments: z.array(segmentSchema).min(1, 'A format needs at least one segment.').max(12, 'A reference of more than 12 segments is unreadable — combine or drop some.'),
    display: z.enum(['Y', 'N']).default('Y'),
  })
  // The cross-segment rules (one counter, only tokens this reference can resolve,
  // fixed text that is actually filled in) live in one place and run on both
  // sides — the client calls validateSegments directly for its live preview.
  .superRefine((data, ctx) => {
    for (const issue of validateSegments(data.segments as McaRefSegment[], data.target_key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: issue.index === null ? ['segments'] : ['segments', issue.index],
        message: issue.message,
      });
    }
  });

export type McaRefFormatUpdateInput = z.infer<typeof mcaRefFormatUpdateSchema>;

/**
 * The whole set in one request, because the setup screen saves what it shows.
 *
 * A target may appear at most once: two rows for the same reference would leave
 * which format applies up to insertion order.
 */
export const mcaRefFormatsUpdateSchema = z
  .object({
    formats: z.array(mcaRefFormatUpdateSchema).min(1, 'Nothing to save.'),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    data.formats.forEach((f, i) => {
      if (seen.has(f.target_key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['formats', i, 'target_key'],
          message: `${MCA_REF_TARGETS[f.target_key].label} was submitted twice — only one format can apply to a reference.`,
        });
      }
      seen.add(f.target_key);
    });
  });

export type McaRefFormatsUpdateInput = z.infer<typeof mcaRefFormatsUpdateSchema>;
