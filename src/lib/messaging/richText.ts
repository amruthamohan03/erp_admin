// The rich-text body of an outbound email or WhatsApp message.
//
// Pure (no DOM, no Node APIs) so the browser editor and the send route run the
// SAME sanitiser — what the operator sees in the editor after a paste is what
// is stored and sent (§4.10).
//
// Sanitising is an allowlist rebuilt from tokens, not a filter over the input:
// every tag in the output was constructed here from a known name, and the only
// attribute that survives is a checked `href`. Anything unrecognised is either
// dropped (the tag) or escaped (the text), so a malformed or hostile fragment
// can at worst become visible text.

const ALLOWED = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del',
  'p', 'div', 'br', 'span', 'blockquote', 'hr',
  'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3',
]);
const VOID = new Set(['br', 'hr']);
/** Tags whose CONTENT is dropped along with the tag — never readable text. */
const DROP_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'head', 'title', 'svg', 'math']);
const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'hr']);
const SAFE_HREF = /^(https?:|mailto:|tel:)/iu;

type Token =
  | { type: 'text'; text: string }
  | { type: 'open'; name: string; href?: string }
  | { type: 'close'; name: string };

const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/gu;
const HREF = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/iu;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function escapeText(s: string): string {
  // An entity already in the text is kept; a bare & is escaped.
  return s
    .replace(/&(?!(#x[0-9a-f]+|#\d+|[a-z]+);)/giu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}

function safeHref(attrs: string): string | undefined {
  const m = HREF.exec(attrs);
  if (!m) return undefined;
  // Control characters and whitespace are stripped before the scheme check:
  // "java\tscript:" is read by browsers as "javascript:".
  const raw = decodeEntities(m[1] ?? m[2] ?? m[3] ?? '').replace(/[\u0000- ]/gu, '');
  return SAFE_HREF.test(raw) ? raw : undefined;
}

/** The input as allowlisted tokens; dropped tags and their dropped contents are gone. */
function tokenize(html: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  let skipping: string | null = null;
  TAG.lastIndex = 0;
  for (let m = TAG.exec(html); m; m = TAG.exec(html)) {
    if (!skipping && m.index > last) out.push({ type: 'text', text: html.slice(last, m.index) });
    last = TAG.lastIndex;
    if (!m[2]) continue; // a comment
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    if (skipping) {
      if (closing && name === skipping) skipping = null;
      continue;
    }
    if (DROP_CONTENT.has(name)) {
      if (!closing && !/\/\s*$/u.test(m[3])) skipping = name;
      continue;
    }
    if (!ALLOWED.has(name)) continue;
    if (closing) out.push({ type: 'close', name });
    else out.push({ type: 'open', name, href: name === 'a' ? safeHref(m[3]) : undefined });
  }
  if (!skipping && last < html.length) out.push({ type: 'text', text: html.slice(last) });
  return out;
}

/**
 * Allowlisted HTML: only the formatting the editor offers, no attributes but a
 * checked link, every tag balanced. Safe to store, to send, and to render.
 */
export function sanitizeHtml(html: string): string {
  const parts: string[] = [];
  const open: string[] = [];
  for (const t of tokenize(html)) {
    if (t.type === 'text') {
      parts.push(escapeText(t.text));
    } else if (t.type === 'open') {
      if (VOID.has(t.name)) {
        parts.push(`<${t.name}>`);
      } else if (t.name === 'a') {
        open.push('a');
        parts.push(
          t.href ? `<a href="${escapeAttr(t.href)}" target="_blank" rel="noopener noreferrer">` : '<a>',
        );
      } else {
        open.push(t.name);
        parts.push(`<${t.name}>`);
      }
    } else if (!VOID.has(t.name)) {
      // Close back to the matching open tag; a close with no opener is dropped.
      const at = open.lastIndexOf(t.name);
      if (at === -1) continue;
      while (open.length > at) parts.push(`</${open.pop()}>`);
    }
  }
  while (open.length) parts.push(`</${open.pop()}>`);
  return parts.join('');
}

/** Bold / italic / strike in WhatsApp's own markup. */
const WA_MARK: Record<string, string> = { b: '*', strong: '*', i: '_', em: '_', s: '~', strike: '~', del: '~' };

function toPlain(html: string, whatsapp: boolean): string {
  const out: string[] = [];
  const marks: Array<{ name: string; at: number }> = [];
  const lists: Array<{ ordered: boolean; n: number }> = [];
  const links: Array<{ at: number; href?: string }> = [];
  const newline = (): void => {
    out.push('\n');
  };

  for (const t of tokenize(html)) {
    if (t.type === 'text') {
      // HTML whitespace is not significant; the tags decide the line breaks.
      out.push(decodeEntities(t.text.replace(/\s+/gu, ' ')));
    } else if (t.type === 'open') {
      if (t.name === 'br') newline();
      else if (t.name === 'hr') out.push('\n────────\n');
      else if (t.name === 'ul' || t.name === 'ol') lists.push({ ordered: t.name === 'ol', n: 0 });
      else if (t.name === 'li') {
        const list = lists.at(-1);
        if (list) list.n += 1;
        out.push(`\n${'  '.repeat(Math.max(0, lists.length - 1))}${list?.ordered ? `${list.n}. ` : '• '}`);
      } else if (BLOCK.has(t.name)) newline();
      else if (t.name === 'a') links.push({ at: out.length, href: t.href });
      else if (whatsapp && WA_MARK[t.name]) marks.push({ name: t.name, at: out.length });
    } else {
      if (t.name === 'ul' || t.name === 'ol') {
        lists.pop();
        newline();
      } else if (t.name === 'a') {
        const link = links.pop();
        if (link?.href) {
          const text = out.slice(link.at).join('').trim();
          const target = link.href.replace(/^mailto:/iu, '');
          if (text !== target && text !== link.href) out.push(` (${link.href.replace(/^mailto:/iu, '')})`);
        }
      } else if (whatsapp && WA_MARK[t.name]) {
        const at = marks.map((m) => m.name).lastIndexOf(t.name);
        if (at === -1) continue;
        const { at: start } = marks.splice(at, 1)[0];
        // WhatsApp only honours a marker hugging the text — "* bold *" stays
        // literal — so surrounding spaces move outside the markers.
        const inner = out.splice(start).join('');
        const m = /^(\s*)([\s\S]*?)(\s*)$/u.exec(inner);
        const mark = WA_MARK[t.name];
        out.push(m && m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : inner);
      } else if (BLOCK.has(t.name) && t.name !== 'li') newline();
    }
  }

  return out
    .join('')
    .replace(/[ \t]+\n/gu, '\n')
    // Leading spaces go, except the indent that nests a list item.
    .replace(/\n[ \t]+(?=[^ \t•\d])/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

/** The plain-text alternative of an email, and what the sent log shows. */
export function htmlToText(html: string): string {
  return toPlain(html, false);
}

/** The body as WhatsApp text: *bold*, _italic_, ~strike~, bullets and links spelled out. */
export function htmlToWhatsApp(html: string): string {
  return toPlain(html, true);
}

/** True when the editor holds nothing a reader would see. */
export function isBlankHtml(html: string): boolean {
  return htmlToText(html).replace(/[•\s]/gu, '') === '';
}
