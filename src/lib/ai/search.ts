// AI Search — a question in plain language, answered from the ERP's own data.
//
// Claude is given a small set of lookups (db/queries/aiSearch.ts) and decides
// which to call; it never sees a table it was not handed and never writes SQL.
// Every lookup is scoped to the modules the caller's role may view, so the
// assistant answers exactly what that person could find on the screens.
//
// What leaves the server: the question, and the rows the lookups return
// (references, client codes, statuses, dates, and — for one record — the
// fields its form shows). Nothing else.
import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import type { z } from 'zod';
import { AppError } from '@/lib/errors';
import type { AuthPayload } from '@/lib/auth';
import {
  AI_MODULES,
  allowedAiModules,
  findRecords,
  licenseSummary,
  listLicenses,
  listTrackingFiles,
  paymentSummary,
  recordDetails,
  trackingSummary,
  type AiModule,
  type AiRecord,
} from '@/db/queries/aiSearch';
import {
  aiFindRecordsInput,
  aiLicenseQueryInput,
  aiLicenseSummaryInput,
  aiPaymentSummaryInput,
  aiRecordDetailsInput,
  aiTrackingQueryInput,
} from '@/schemas/aiSearch';

/** The menu URL that IS the AI Search resource (§4.7). */
export const AI_SEARCH_RESOURCE = '/ask';

/** Overridable per deployment; the default is the current Opus. */
const MODEL = process.env.AI_SEARCH_MODEL?.trim() || 'claude-opus-5-5';
/** A question that needs more lookups than this is too broad to answer well. */
const MAX_ITERATIONS = 8;

export const AI_NOT_CONFIGURED =
  'AI Search is not set up on this server — an administrator must set ANTHROPIC_API_KEY (from console.anthropic.com → API Keys) in the environment, then restart the application.';

export function aiSearchConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim());
}

/** A headline number the answer panel draws as a tile. */
export interface AiFigure {
  label: string;
  value: number;
  /** Which way the number reads — a status word the badge palette classifies. */
  tone?: string;
}

export interface AiSearchResult {
  answer: string;
  figures: AiFigure[];
  records: AiRecord[];
  /** The lookups made, in order — shown under the answer as "Searched: …". */
  steps: string[];
}

const SYSTEM = `You are the search assistant inside a customs clearance & logistics ERP used in the DRC. Staff ask about licences (import "IB" and export), import/export/local tracking files, invoices and payment requests.

Answer ONLY from what the tools return. Never guess a status, count, date or reference — if the tools found nothing, say so plainly and suggest what to check (a different spelling of the reference, a client code, a date range).

How to work:
- A reference, file number, licence number or invoice number in the question → call find_records first. If exactly one record matches and the person wants its details, call get_record_details.
- "How many…" questions → prefer the summary tools, which count every matching row; the list tools return a total plus the first few rows.
- "Recently" with no period means the last 30 days. Today's date is given with each question.
- Clients are known by a 3-letter code (e.g. NMI) or by their company name; pass either as \`client\`.
- If a tool says the person has no access to a module, tell them that module is not available to their role — do not try to work around it.

How to answer:
- Lead with the direct answer in one sentence, then only the detail that helps. Keep it short.
- Name records by their reference. Write dates as DD-MM-YYYY. Put key values in **bold**.
- Use "- " bullet lines for lists. No tables, no headings, no links — the screen shows the matching records as cards with links under your answer.
- Reply in the language the question was asked in (English or French).`;

/** Run a model-supplied argument through its schema; a bad one goes back as an error. */
function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const res = schema.safeParse(input);
  if (!res.success) throw new Error(`Invalid arguments: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return res.data;
}

const NO_ACCESS = (what: string): string => JSON.stringify({ no_access: `The person's role cannot view ${what}.` });

const clientProp = { type: 'string', description: 'Client 3-letter code (e.g. NMI) or part of the company name.' } as const;

export async function runAiSearch(session: AuthPayload, question: string): Promise<AiSearchResult> {
  if (!aiSearchConfigured()) throw new AppError(AI_NOT_CONFIGURED, 503, 'INTERNAL_ERROR');

  const allowed = await allowedAiModules(session);
  const records = new Map<string, AiRecord>();
  const figures: AiFigure[] = [];
  const steps: string[] = [];
  const keep = (rs: AiRecord[]): void => {
    for (const r of rs) records.set(`${r.module}:${r.id}`, r);
  };
  const moduleNames = [...allowed].map((m) => AI_MODULES[m].label).join(', ') || 'none';

  const tools = [
    betaTool({
      name: 'find_records',
      description:
        'Find licences, tracking files, invoices and payment requests by any reference the person quotes (file/MCA reference, licence number, declaration, invoice, lot or PO number). Tolerant of dashes, spaces and leading zeros. Returns up to 10 matches, exact matches first.',
      inputSchema: {
        type: 'object',
        properties: { reference: { type: 'string', description: 'The reference as the person wrote it.' } },
        required: ['reference'],
        additionalProperties: false,
      },
      run: async (input) => {
        const a = parse(aiFindRecordsInput, input);
        steps.push(`Reference "${a.reference}"`);
        const found = await findRecords(allowed, a.reference);
        keep(found);
        return JSON.stringify({ matches: found.map(({ link: _l, ...r }) => r) });
      },
    }),
    betaTool({
      name: 'get_record_details',
      description:
        'Every filled field of ONE record, by the label its form uses (dates DD-MM-YYYY, codes resolved to names). Use after find_records when the person wants more than the status.',
      inputSchema: {
        type: 'object',
        properties: {
          module: { type: 'string', enum: Object.keys(AI_MODULES) },
          id: { type: 'integer', description: 'The id from find_records or a list tool.' },
        },
        required: ['module', 'id'],
        additionalProperties: false,
      },
      run: async (input) => {
        const a = parse(aiRecordDetailsInput, input);
        const shown = await recordDetails(allowed, a.module as AiModule, a.id);
        if (shown && 'denied' in shown) return NO_ACCESS(AI_MODULES[a.module as AiModule].label);
        if (!shown) return JSON.stringify({ not_found: true });
        if (shown.record) keep([shown.record]);
        steps.push(`Details of ${shown.record?.reference ?? `${shown.title} #${a.id}`}`);
        return JSON.stringify({ title: shown.title, fields: shown.fields });
      },
    }),
    betaTool({
      name: 'license_summary',
      description:
        'Count licences in every status bucket at once: total, active, expiring in 30 days, expired, expired in the last 30 days, annulated, modified, prorogated, inactive. Expired is derived: an ACTIVE licence whose expiry date has passed.',
      inputSchema: {
        type: 'object',
        properties: { side: { type: 'string', enum: ['import', 'export', 'both'] }, client: clientProp },
        additionalProperties: false,
      },
      run: async (input) => {
        const a = parse(aiLicenseSummaryInput, input);
        const res = await licenseSummary(allowed, a);
        if (res.denied) return NO_ACCESS('licences');
        steps.push(`Licence summary${a.client ? ` for ${a.client}` : ''}`);
        const c = res.counts;
        figures.push(
          { label: 'Licences', value: c['total'] ?? 0 },
          { label: 'Active', value: c['active'] ?? 0, tone: 'ACTIVE' },
          { label: 'Expiring ≤ 30 days', value: c['expiring_in_30_days'] ?? 0, tone: 'PENDING' },
          { label: 'Expired', value: c['expired'] ?? 0, tone: 'EXPIRED' },
        );
        return JSON.stringify(res.counts);
      },
    }),
    betaTool({
      name: 'list_licenses',
      description:
        'Licences matching a status filter, with the total count and the first rows (expired: most recently lapsed first; otherwise soonest expiry first). Use expired_within_days for "recently expired" (default meaning: 30).',
      inputSchema: {
        type: 'object',
        properties: {
          side: { type: 'string', enum: ['import', 'export', 'both'] },
          filter: { type: 'string', enum: ['all', 'active', 'expiring', 'expired', 'annulated', 'modified', 'prorogated', 'inactive'] },
          client: clientProp,
          expired_within_days: { type: 'integer', description: 'With filter "expired": only those whose expiry date fell in the last N days.' },
          expiring_within_days: { type: 'integer', description: 'With filter "expiring": horizon in days (default 30).' },
          limit: { type: 'integer', description: 'Rows to return, 1–25 (default 10).' },
        },
        additionalProperties: false,
      },
      run: async (input) => {
        const a = parse(aiLicenseQueryInput, input);
        const res = await listLicenses(allowed, a);
        if (res.denied) return NO_ACCESS('licences');
        steps.push(`Licences: ${a.filter ?? 'all'}${a.client ? ` for ${a.client}` : ''}`);
        keep(res.records);
        figures.push({ label: `${a.filter && a.filter !== 'all' ? a.filter[0]!.toUpperCase() + a.filter.slice(1) : 'All'} licences`, value: res.total, tone: a.filter?.toUpperCase() });
        return JSON.stringify({ total: res.total, rows: res.records.map(({ link: _l, ...r }) => r) });
      },
    }),
    betaTool({
      name: 'tracking_summary',
      description: 'Count import, export or local tracking files by clearing status (IN TRANSIT, IN PROGRESS, CLEARING COMPLETED, CANCELLED…), optionally for one client and a creation-date range.',
      inputSchema: {
        type: 'object',
        properties: {
          module: { type: 'string', enum: ['import', 'export', 'local'] },
          client: clientProp,
          created_from: { type: 'string', description: 'YYYY-MM-DD' },
          created_to: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['module'],
        additionalProperties: false,
      },
      run: async (input) => {
        const a = parse(aiTrackingQueryInput, input);
        const res = await trackingSummary(allowed, a);
        if (res.denied) return NO_ACCESS(AI_MODULES[a.module].label);
        steps.push(`${AI_MODULES[a.module].label} by status${a.client ? ` for ${a.client}` : ''}`);
        figures.push({ label: `${AI_MODULES[a.module].label} files`, value: res.total });
        for (const s of res.by_status.slice(0, 3)) figures.push({ label: s.status, value: s.count, tone: s.status });
        return JSON.stringify(res);
      },
    }),
    betaTool({
      name: 'list_tracking_files',
      description: 'Import, export or local tracking files matching filters, newest first, with the total count. `status` matches the clearing status text.',
      inputSchema: {
        type: 'object',
        properties: {
          module: { type: 'string', enum: ['import', 'export', 'local'] },
          client: clientProp,
          status: { type: 'string', description: 'Clearing status, e.g. "IN TRANSIT". Partial text is fine.' },
          created_from: { type: 'string', description: 'YYYY-MM-DD' },
          created_to: { type: 'string', description: 'YYYY-MM-DD' },
          limit: { type: 'integer', description: 'Rows to return, 1–25 (default 10).' },
        },
        required: ['module'],
        additionalProperties: false,
      },
      run: async (input) => {
        const a = parse(aiTrackingQueryInput, input);
        const res = await listTrackingFiles(allowed, a);
        if (res.denied) return NO_ACCESS(AI_MODULES[a.module].label);
        steps.push(`${AI_MODULES[a.module].label} files${a.status ? ` "${a.status}"` : ''}${a.client ? ` for ${a.client}` : ''}`);
        keep(res.records);
        figures.push({ label: `${AI_MODULES[a.module].label} files`, value: res.total, tone: a.status ?? undefined });
        return JSON.stringify({ total: res.total, rows: res.records.map(({ link: _l, ...r }) => r) });
      },
    }),
    betaTool({
      name: 'payment_summary',
      description: 'Count payment requests by the approval stage they are waiting on (or Rejected / completed), optionally for one client.',
      inputSchema: { type: 'object', properties: { client: clientProp }, additionalProperties: false },
      run: async (input) => {
        const a = parse(aiPaymentSummaryInput, input);
        const res = await paymentSummary(allowed, a);
        if (res.denied) return NO_ACCESS('payment requests');
        steps.push(`Payment requests by stage${a.client ? ` for ${a.client}` : ''}`);
        figures.push({ label: 'Payment requests', value: res.total });
        for (const s of res.by_status.slice(0, 3)) figures.push({ label: s.status, value: s.count, tone: s.status });
        return JSON.stringify(res);
      },
    }),
  ];

  const client = new Anthropic();
  const today = new Date().toISOString().slice(0, 10);
  let final: Anthropic.Beta.BetaMessage;
  try {
    final = await client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 16000,
      // Lookups, not hard reasoning: low effort keeps an answer to a few seconds.
      output_config: { effort: 'low' },
      // On a policy decline the API re-runs the request on a fallback model
      // inside the same call, rather than the operator getting no answer.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      max_iterations: MAX_ITERATIONS,
      system: SYSTEM,
      tools,
      messages: [
        {
          role: 'user',
          // Volatile context goes in the message, not the system prompt, so the
          // system prompt and tools stay a stable prefix.
          content: `Today is ${today}. Modules this person can view: ${moduleNames}.\n\nQuestion: ${question}`,
        },
      ],
    });
  } catch (err) {
    throw describeAiError(err);
  }

  if (final.stop_reason === 'refusal') {
    throw new AppError('AI Search declined this question. Rephrase it as a question about licences, files, invoices or payments.', 422, 'VALIDATION_ERROR');
  }
  const answer = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  return {
    answer: answer || (final.stop_reason === 'tool_use'
      ? 'That question needed more lookups than one search allows — narrow it to a client, a module or a period.'
      : 'No answer was produced. Try rephrasing the question.'),
    figures: dedupeFigures(figures),
    records: [...records.values()].slice(0, 12),
    steps,
  };
}

/** The same tile from two calls (a summary then a list) is one tile. */
function dedupeFigures(figures: AiFigure[]): AiFigure[] {
  const seen = new Map<string, AiFigure>();
  for (const f of figures) seen.set(f.label, f);
  return [...seen.values()].slice(0, 6);
}

/** §4.39 — say what went wrong with the AI service, in words an operator can act on. */
function describeAiError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AppError('AI Search could not sign in to the AI service — the ANTHROPIC_API_KEY on the server is invalid or has been revoked. An administrator must replace it.', 503, 'INTERNAL_ERROR');
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AppError('AI Search is busy right now (the AI service rate limit was reached) — try again in a minute.', 503, 'INTERNAL_ERROR');
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AppError('AI Search could not reach the AI service — check the server’s internet connection, then try again.', 503, 'INTERNAL_ERROR');
  }
  if (err instanceof Anthropic.APIError) {
    return new AppError(`The AI service returned an error (HTTP ${err.status ?? '?'}): ${err.message}`, 502, 'INTERNAL_ERROR');
  }
  return err instanceof Error ? err : new Error(String(err));
}
