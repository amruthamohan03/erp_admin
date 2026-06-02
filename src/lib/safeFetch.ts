// Single helper for "fetch + parse JSON" that survives:
//   * empty response bodies (server crashed mid-response)
//   * non-JSON bodies (Next.js HTML error overlay)
//   * 4xx/5xx responses with our standard fail() envelope
//
// Returns a discriminated result so callers stop having to write
// duplicated try/catch + res.ok + res.json() ladders.

export type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; detail?: string };

export async function safeFetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<FetchResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    return { ok: false, status: 0, message: 'Network error', detail: (err as Error)?.message };
  }

  // Read the body as text first so we can show it on parse failure.
  let text = '';
  try {
    text = await res.text();
  } catch (err) {
    return { ok: false, status: res.status, message: 'Could not read response body', detail: (err as Error)?.message };
  }

  if (!text.trim()) {
    return {
      ok: false,
      status: res.status,
      message: `Empty response (status ${res.status})`,
      detail: 'The server returned no body. Check the dev server console for an error or a crashed handler.',
    };
  }

  let json: { success?: boolean; data?: T; message?: string; detail?: string };
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

  if (!res.ok || !json?.success) {
    return {
      ok: false,
      status: res.status,
      message: json?.message ?? `Request failed (status ${res.status})`,
      detail: json?.detail,
    };
  }

  return { ok: true, data: json.data as T };
}
