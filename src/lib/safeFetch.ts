// Single helper for "fetch + parse JSON" that survives:
//   * empty response bodies (server crashed mid-response)
//   * non-JSON bodies (Next.js HTML error overlay)
//   * 4xx/5xx responses with our standard fail() envelope
//
// Returns a discriminated result so callers stop having to write
// duplicated try/catch + res.ok + res.json() ladders.
//
// Envelope per root CLAUDE.md §4.4:
//   { ok: true,  data: T, meta?: {...} }
//   { ok: false, error: { code, message, details? } }

export type FetchResult<T> =
  | {
      ok: true;
      data: T;
      /**
       * The envelope's `meta` (§4.4) — pagination totals and the like. Exposed
       * because a paginated list needs `meta.total` alongside `data`, and
       * without it every such caller falls back to a raw fetch and re-implements
       * the parsing this helper exists to own.
       */
      meta?: Record<string, unknown>;
    }
  | {
      ok: false;
      status: number;
      message: string;
      detail?: string;
      /**
       * `error.details.field` when the server pointed at a specific input, so a
       * form can mark it. Lifted out of `details` because every form that
       * highlights a field would otherwise re-parse the stringified blob.
       *
       * Falls back to the first key of `fieldMessages`, so a validation failure
       * marks its input whichever of the two shapes the route produced.
       */
      field?: string;
      /**
       * Per-field validation messages from `error.details.fields` (§4.23),
       * keyed by the wire path — `{ project_name: ['Project Name is required'] }`.
       * A form marks each input and prints its own sentence beneath it; a page
       * without field-level marking can ignore this and show `message`.
       */
      fieldMessages?: Record<string, string[]>;
    };

export async function safeFetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<FetchResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: 'Network error',
      detail: (err as Error)?.message,
    };
  }

  // Read the body as text first so we can show it on parse failure.
  let text = '';
  try {
    text = await res.text();
  } catch (err) {
    return {
      ok: false,
      status: res.status,
      message: 'Could not read response body',
      detail: (err as Error)?.message,
    };
  }

  if (!text.trim()) {
    return {
      ok: false,
      status: res.status,
      message: `Empty response (status ${res.status})`,
      detail:
        'The server returned no body. Check the dev server console for an error or a crashed handler.',
    };
  }

  let json: {
    ok?: boolean;
    data?: T;
    meta?: Record<string, unknown>;
    error?: { code?: string; message?: string; details?: unknown };
  };
  try {
    json = JSON.parse(text);
  } catch {
    const snippet = text.length > 200 ? text.slice(0, 200) + '...' : text;
    return {
      ok: false,
      status: res.status,
      message: 'Server returned non-JSON response',
      detail: snippet,
    };
  }

  if (!res.ok || !json?.ok) {
    const details = json?.error?.details;
    const isObject = !!details && typeof details === 'object' && !Array.isArray(details);
    const bag = isObject ? (details as Record<string, unknown>) : null;
    const fieldMessages = parseFieldMessages(bag?.fields);
    const namedField = typeof bag?.field === 'string' ? bag.field : undefined;
    const field = namedField ?? Object.keys(fieldMessages ?? {})[0];
    const message = json?.error?.message ?? `Request failed (status ${res.status})`;

    // Keys the envelope carries for machines, not for reading. Printing them is
    // how a user ends up staring at {"fieldErrors":{…}} under a save failure —
    // `fields` is rendered as prose below and `errors` is Zod's raw flatten().
    const MACHINE_KEYS = ['field', 'fields', 'errors'];
    const hasProse = !!bag && Object.keys(bag).some((k) => !MACHINE_KEYS.includes(k));

    return {
      ok: false,
      status: res.status,
      message,
      detail:
        details === undefined
          ? undefined
          : typeof details === 'string'
            ? details
            : hasProse
              ? JSON.stringify(details)
              : // Several bad fields: `message` says how many, this lists them.
                // One bad field: `message` already is that sentence, so adding
                // it again would print it twice in the dialog.
                fieldSentences(fieldMessages, message),
      field,
      fieldMessages,
    };
  }

  return { ok: true, data: json.data as T, meta: json.meta };
}

/** `details.fields` → `{ path: [message, …] }`, ignoring anything mis-shaped. */
function parseFieldMessages(raw: unknown): Record<string, string[]> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const messages = (Array.isArray(value) ? value : [value]).filter(
      (m): m is string => typeof m === 'string' && m.length > 0,
    );
    if (messages.length) out[key] = messages;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Every field message on one line, minus the one already used as `message`. */
function fieldSentences(
  fieldMessages: Record<string, string[]> | undefined,
  message: string,
): string | undefined {
  if (!fieldMessages) return undefined;
  const all = Object.values(fieldMessages).flat();
  const rest = all.filter((m) => m !== message);
  return rest.length ? rest.join(' ') : undefined;
}
