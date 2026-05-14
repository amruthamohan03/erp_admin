'use client';

import * as React from 'react';
import { defaultLocale, isLocale, type Locale } from '@/i18n/config';
import { setLocaleAction } from '@/i18n/actions';

interface TranslateContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  pending: boolean;
}

const TranslateContext = React.createContext<TranslateContextValue | null>(null);

export function useTranslate(): TranslateContextValue {
  const ctx = React.useContext(TranslateContext);
  if (!ctx) throw new Error('useTranslate must be used inside <TranslateProvider>');
  return ctx;
}

/* ------------------------------------------------------------------ */
/* DOM walking + translation                                          */
/* ------------------------------------------------------------------ */

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'SAMP', 'VAR',
  'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'BUTTON',
]);

// Per-locale memory cache: key = original text, value = translated text.
const cache = new Map<string, Map<string, string>>();
// Tracks each text node's CURRENT-displayed translation so we don't re-translate identical text.
const nodeState = new WeakMap<Text, { original: string; rendered: string }>();

function localeCache(locale: string): Map<string, string> {
  let m = cache.get(locale);
  if (!m) {
    m = new Map();
    cache.set(locale, m);
  }
  return m;
}

function isTranslatable(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  // Skip pure punctuation / numbers / symbols.
  if (!/[A-Za-z]/.test(trimmed)) return false;
  return true;
}

function shouldSkipElement(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.getAttribute('translate') === 'no') return true;
  if (el.hasAttribute('data-no-translate')) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

function collectTextNodes(root: Node, out: Text[]): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        return shouldSkipElement(node as Element)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_SKIP;
      }
      const text = (node as Text).data;
      return isTranslatable(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let n: Node | null = walker.nextNode();
  while (n) {
    out.push(n as Text);
    n = walker.nextNode();
  }
}

function uniqueOriginals(nodes: Text[], locale: string): { needsFetch: string[]; map: Map<Text, string> } {
  const c = localeCache(locale);
  const map = new Map<Text, string>();
  const need = new Set<string>();
  for (const node of nodes) {
    const original = (nodeState.get(node)?.original ?? node.data);
    map.set(node, original);
    const cached = c.get(original);
    if (cached === undefined) need.add(original);
  }
  return { needsFetch: Array.from(need), map };
}

async function fetchTranslations(texts: string[], target: string): Promise<Record<string, string>> {
  if (texts.length === 0) return {};
  const out: Record<string, string> = {};
  // Chunk to keep payloads small and stay under server validation max (200).
  const chunkSize = 50;
  for (let i = 0; i < texts.length; i += chunkSize) {
    const slice = texts.slice(i, i + chunkSize);
    try {
      const r = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: slice, target, source: 'en' }),
      });
      const j = await r.json();
      if (j.success && Array.isArray(j.data?.translations)) {
        for (let k = 0; k < slice.length; k++) {
          out[slice[k]] = j.data.translations[k] ?? slice[k];
        }
      } else {
        for (const t of slice) out[t] = t;
      }
    } catch {
      for (const t of slice) out[t] = t;
    }
  }
  return out;
}

function applyTranslations(nodes: Text[], originals: Map<Text, string>, locale: string): void {
  const c = localeCache(locale);
  for (const node of nodes) {
    const original = originals.get(node);
    if (!original) continue;
    const translated = c.get(original) ?? original;
    const state = nodeState.get(node);
    // Only mutate if the visible value would actually change.
    if (state?.rendered === translated) continue;
    // Preserve surrounding whitespace.
    const leading = original.match(/^\s*/)?.[0] ?? '';
    const trailing = original.match(/\s*$/)?.[0] ?? '';
    const core = translated.trim();
    node.data = `${leading}${core}${trailing}`;
    nodeState.set(node, { original, rendered: translated });
  }
}

function restoreOriginals(root: Node): void {
  const all: Text[] = [];
  collectTextNodes(root, all);
  for (const node of all) {
    const state = nodeState.get(node);
    if (state) {
      node.data = state.original;
      nodeState.delete(node);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Provider                                                           */
/* ------------------------------------------------------------------ */

export default function TranslateProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale);
  const [pending, setPending] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const localeRef = React.useRef(locale);
  localeRef.current = locale;

  const translatePending = React.useRef(false);
  const dirty = React.useRef<Set<Text>>(new Set());
  const flushTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = React.useCallback(async () => {
    if (translatePending.current) return;
    const target = localeRef.current;
    if (target === defaultLocale) {
      dirty.current.clear();
      return;
    }
    const nodes = Array.from(dirty.current).filter((n) => n.isConnected);
    dirty.current.clear();
    if (nodes.length === 0) return;

    translatePending.current = true;
    setPending(true);
    try {
      const { needsFetch, map } = uniqueOriginals(nodes, target);
      if (needsFetch.length > 0) {
        const fetched = await fetchTranslations(needsFetch, target);
        const c = localeCache(target);
        for (const [src, dst] of Object.entries(fetched)) c.set(src, dst);
      }
      applyTranslations(nodes, map, target);
    } finally {
      translatePending.current = false;
      setPending(false);
    }
  }, []);

  const scheduleFlush = React.useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      void flush();
    }, 60);
  }, [flush]);

  const queue = React.useCallback(
    (root: Node) => {
      if (localeRef.current === defaultLocale) return;
      const nodes: Text[] = [];
      collectTextNodes(root, nodes);
      for (const n of nodes) dirty.current.add(n);
      if (nodes.length > 0) scheduleFlush();
    },
    [scheduleFlush],
  );

  // Re-translate on locale changes.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (locale === defaultLocale) {
      restoreOriginals(root);
      return;
    }
    queue(root);
  }, [locale, queue]);

  // Observe DOM changes so React re-renders get translated.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const observer = new MutationObserver((records) => {
      if (localeRef.current === defaultLocale) return;
      for (const rec of records) {
        if (rec.type === 'characterData') {
          const node = rec.target;
          if (node.nodeType === Node.TEXT_NODE && isTranslatable((node as Text).data)) {
            // Clear stale state — the text content changed.
            nodeState.delete(node as Text);
            dirty.current.add(node as Text);
          }
        } else if (rec.type === 'childList') {
          rec.addedNodes.forEach((added) => {
            if (added.nodeType === Node.TEXT_NODE) {
              if (isTranslatable((added as Text).data)) dirty.current.add(added as Text);
            } else if (added.nodeType === Node.ELEMENT_NODE) {
              const fresh: Text[] = [];
              collectTextNodes(added, fresh);
              for (const n of fresh) dirty.current.add(n);
            }
          });
        }
      }
      if (dirty.current.size > 0) scheduleFlush();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [scheduleFlush]);

  const setLocale = React.useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    setLocaleState(next);
    void setLocaleAction(next);
  }, []);

  const value = React.useMemo<TranslateContextValue>(
    () => ({ locale, setLocale, pending }),
    [locale, setLocale, pending],
  );

  return (
    <TranslateContext.Provider value={value}>
      <div ref={rootRef} className="contents">
        {children}
      </div>
    </TranslateContext.Provider>
  );
}
