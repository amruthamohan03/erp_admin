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

export function renderTemplate(template: string, context: TemplateContext): string {
  const filled = template.replace(/\{(\w+)\}/gu, (_, key: string) => {
    const v = context[key];
    return v === null || v === undefined ? '' : String(v);
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
