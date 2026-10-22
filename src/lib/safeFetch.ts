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
      /**
       * `error.details` as the object the route sent, when it sent one.
       *
       * `detail` above is the same thing flattened for *reading*; this is it
       * intact, for a caller that has to act on it. A refusal can then be a
       * question rather than a dead end — the seal release answers 409 with the
       * export files still holding a seal, and the page turns that into a
       * confirmation instead of making the operator go and look.
       *
       * Reading it means knowing the route's shape, so narrow it at the call
       * site; that is the same parse boundary Zod occupies on the server (§6).
       */
      details?: Record<string, unknown>;
    };

export async function safeFetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<FetchResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    return { ok: false, status: 0, message: networkFailureMessage(err) };
  }

  // Read the body as text first so we can show it on parse failure.
  let text = '';
  try {
    text = await res.text();
  } catch (err) {
    return {
      ok: false,
      status: res.status,
      message: `The server's answer was cut off before it finished (${httpLabel(res)}). Try again.`,
      detail: (err as Error)?.message,
    };
  }

  if (!text.trim()) {
    return {
      ok: false,
      status: res.status,
      message: res.ok
        ? `The server answered with an empty response (${httpLabel(res)}) instead of data. Try again, and report it if it repeats.`
        : httpFailureMessage(res.status, res.statusText),
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
    // An HTML error page from Next or a proxy: its <title> is the one readable
    // line in it, and the markup itself is never shown.
    const title = /<title[^>]*>([^<]*)<\/title>/iu.exec(text)?.[1]?.trim();
    return {
      ok: false,
      status: res.status,
      message: res.ok
        ? `The server answered with a web page instead of data (${httpLabel(res)}). The address may be wrong, or the server may be running a different version of the application.`
        : httpFailureMessage(res.status, res.statusText),
      detail: title || undefined,
    };
  }

  if (!res.ok || !json?.ok) {
    const details = json?.error?.details;
    const isObject = !!details && typeof details === 'object' && !Array.isArray(details);
    const bag = isObject ? (details as Record<string, unknown>) : null;
    const fieldMessages = parseFieldMessages(bag?.fields);
    const namedField = typeof bag?.field === 'string' ? bag.field : undefined;
    const field = namedField ?? Object.keys(fieldMessages ?? {})[0];
    const message = json?.error?.message || httpFailureMessage(res.status, res.statusText);

    // Keys the envelope carries for machines, not for reading. Printing them is
    // how a user ends up staring at {"fieldErrors":{…}} under a save failure —
    // `fields` is rendered as prose below and `errors` is Zod's raw flatten().
    const MACHINE_KEYS = ['field', 'fields', 'errors', 'ref'];
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
      details: bag ?? undefined,
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

// §4.39 — the sentences a failed request is reported with when the server's own
// envelope is missing. Each names what happened and what to do, so a caller
// never needs a "Network error" / "Save failed" fallback of its own.

function httpLabel(res: Response): string {
  return `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
}

/** The fetch itself threw — nothing reached the server, or nothing came back. */
export function networkFailureMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'The request was cancelled before the server answered.';
  }
  const reason = err instanceof Error && err.message ? ` (${err.message})` : '';
  return `Could not reach the server — check your network connection, or whether the server is running${reason}.`;
}

/** A failed HTTP status with no usable error message from the server. */
export function httpFailureMessage(status: number, statusText = ''): string {
  const label = `HTTP ${status}${statusText ? ` ${statusText}` : ''}`;
  if (status === 401) return 'You are not signed in, or your session has expired. Sign in again to continue.';
  if (status === 403) return `Your role is not allowed to do this (${label}). An administrator can grant it under Mapping → Role to Menu.`;
  if (status === 404) return `The server has no endpoint at this address (${label}). The server may be running an older version of the application.`;
  if (status === 408 || status === 504) return `The server took too long to answer (${label}). Try again in a moment.`;
  if (status === 413) return `The request is too large for the server to accept (${label}). Choose a smaller file.`;
  if (status === 502 || status === 503) return `The server is not available right now (${label}) — it may be restarting. Wait a moment and try again.`;
  if (status >= 500) return `The server failed while handling the request (${label}) and gave no reason. Try again, and report it if it repeats.`;
  return `The server refused the request (${label}) and gave no reason.`;
}
