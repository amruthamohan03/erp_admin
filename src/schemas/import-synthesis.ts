import { z } from 'zod';

// Import License → Import Synthesis — request schemas (§4.7).

/** The menu URL every Import Synthesis route checks permissions against (0172). */
export const IMPORT_SYNTHESIS_RESOURCE = '/import-synthesis';

const id = (label: string) => z.coerce.number().int().positive(`${label} must be chosen.`);

/** One kind's licences for one client — the synthesis table and its export. */
export const synthesisLicenseQuerySchema = z.object({
  kind_id: id('Kind'),
  client_id: id('Client'),
});
export type SynthesisLicenseQuery = z.infer<typeof synthesisLicenseQuerySchema>;
