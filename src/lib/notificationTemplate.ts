// Fill a notification event's configured text (notification_event_master_t)
// from the context the event was raised with.
//
// `{token}` is replaced by the context value of that name. A token the context
// does not carry renders EMPTY rather than as `{token}`: a configured message
// that names a detail one event lacks should read slightly shorter, not show
// the operator raw template syntax. Doubled spaces and a dangling separator
// left behind by an empty token are tidied up.
//
// Pure — used by the server when an event is raised and by the settings screen
// to preview a template against sample values.

export type TemplateContext = Record<string, string | number | null | undefined>;

/** Escapes a value for an HTML template, so record data cannot add markup to an email body. */
export function escapeHtml(s: string): string {
  return s.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
}

export function renderTemplate(
  template: string,
  context: TemplateContext,
  opts: { escape?: (value: string) => string } = {},
): string {
  const filled = template.replace(/\{(\w+)\}/gu, (_, key: string) => {
    const v = context[key];
    if (v === null || v === undefined) return '';
    return opts.escape ? opts.escape(String(v)) : String(v);
  });
  return filled
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/\s+([,.;:])/gu, '$1')
    .replace(/(^|\s)[—–-]\s*$/u, '')
    .trim();
}

/** The tokens a template uses — the settings screen lists them beside the field. */
export function templateTokens(template: string): string[] {
  return [...new Set([...template.matchAll(/\{(\w+)\}/gu)].map((m) => m[1] as string))];
}
