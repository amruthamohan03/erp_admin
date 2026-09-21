// Reading a SCANNED document — an ID card, a licence, a certificate — into the
// fields of the module being imported into.
//
// The Claude API is called over plain fetch: no SDK dependency (§3), one POST,
// and the model is asked for JSON keyed by the module's own field names. What
// comes back is a SUGGESTION — the import screen shows every value for the
// operator to correct, and the module's save route validates it like any other
// input. Nothing is created from the model's word alone.
//
// Needs ANTHROPIC_API_KEY in the environment. Without it the feature says so
// plainly instead of failing mid-upload; spreadsheets are unaffected.
import { ValidationError } from '@/lib/errors';
import type { TargetField } from './mapping';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-5';
/** A scan is one record; the reply is a small JSON object. */
const MAX_TOKENS = 2000;
/** Anthropic's own ceiling for an inline document/image is 32 MB base64. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

const MEDIA_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export interface ExtractedDocument {
  /** field name → value read from the document. Only fields it actually found. */
  values: Record<string, string>;
  /** What the model could not find or was unsure about, for the review screen. */
  notes: string | null;
}

export const documentExtractionAvailable = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

function contentBlock(fileName: string, base64: string): Record<string, unknown> {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  const mediaType = MEDIA_TYPES[ext];
  if (!mediaType) {
    throw new ValidationError(`A ${ext || 'file'} cannot be read as a document — upload a PDF, PNG, JPG or WEBP.`, {
      field: 'file',
    });
  }
  const source = { type: 'base64', media_type: mediaType, data: base64 };
  return mediaType === 'application/pdf' ? { type: 'document', source } : { type: 'image', source };
}

/** The reply may be fenced or prefaced; take the outermost JSON object. */
function parseJsonReply(text: string): Record<string, unknown> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new ValidationError('The document could not be read — try a clearer scan, or type the details in.', {
      field: 'file',
    });
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new ValidationError('The document could not be read — try a clearer scan, or type the details in.', {
      field: 'file',
    });
  }
}

/**
 * Read one document into `values` keyed by field name.
 *
 * `fields` is the module's own field list, so the model is told exactly what is
 * wanted and never invents a column the module does not have.
 */
export async function extractDocument(
  buffer: Buffer,
  fileName: string,
  targetName: string,
  fields: TargetField[],
): Promise<ExtractedDocument> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ValidationError(
      'Reading scanned documents is not switched on — ANTHROPIC_API_KEY is not set on the server. Upload a spreadsheet instead, or ask an administrator to configure it.',
      { field: 'file' },
    );
  }
  if (buffer.byteLength > MAX_DOCUMENT_BYTES) {
    throw new ValidationError(
      `That scan is ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB. Upload a smaller file.`,
      { field: 'file' },
    );
  }

  const wanted = fields
    .map((f) => `- ${f.name}: ${f.label}${f.required ? ' (required)' : ''}${f.type === 'date' ? ' — format YYYY-MM-DD' : ''}`)
    .join('\n');

  const prompt = [
    `You are reading a scanned document so it can be entered as a "${targetName}" record in a customs ERP.`,
    '',
    'Return ONLY a JSON object of this shape:',
    '{ "values": { "<field name>": "<value read from the document>" }, "notes": "<anything unclear, or null>" }',
    '',
    'The fields, by name:',
    wanted,
    '',
    'Rules:',
    '- Use only these field names. Omit any field the document does not show — never guess a value.',
    '- Copy values exactly as printed, without reformatting, except dates, which are YYYY-MM-DD.',
    '- If the scan is unreadable, return { "values": {}, "notes": "why" }.',
  ].join('\n');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: [contentBlock(fileName, buffer.toString('base64')), { type: 'text', text: prompt }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // The key, the quota and the file are three different problems for whoever
    // has to fix them, so the message says which one it is (§4.23).
    const reason =
      res.status === 401 ? 'the API key was refused'
        : res.status === 429 ? 'the rate limit was reached — try again shortly'
          : res.status >= 500 ? 'the service is unavailable'
            : `the request was refused (${res.status})`;
    throw new ValidationError(`The document could not be read: ${reason}.`, {
      field: 'file',
      detail: detail.slice(0, 300),
    });
  }

  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (body.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
  const parsed = parseJsonReply(text);

  const allowed = new Set(fields.map((f) => f.name));
  const raw = (parsed['values'] ?? {}) as Record<string, unknown>;
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.has(key) || value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text !== '') values[key] = text;
  }
  const notes = typeof parsed['notes'] === 'string' && parsed['notes'].trim() !== '' ? parsed['notes'].trim() : null;
  return { values, notes };
}
