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
  | { ok: true; data: T }
  | {
      ok: false;
      status: number;
      message: string;
      detail?: string;
      /**
       * `error.details.field` when the server pointed at a specific input, so a
       * form can mark it. Lifted out of `details` because every form that
       * highlights a field would otherwise re-parse the stringified blob.
       */
      field?: string;
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
    const field = typeof bag?.field === 'string' ? bag.field : undefined;
    // A details bag that only names the offending field carries no extra prose —
    // the caller marks that input instead of printing {"field":"…"} at the user.
    const onlyField = !!bag && field !== undefined && Object.keys(bag).length === 1;

    return {
      ok: false,
      status: res.status,
      message: json?.error?.message ?? `Request failed (status ${res.status})`,
      detail:
        details === undefined || onlyField
          ? undefined
          : typeof details === 'string'
            ? details
            : JSON.stringify(details),
      field,
    };
  }

  return { ok: true, data: json.data as T };
}
