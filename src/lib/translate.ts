import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Translation backend.
 *
 *   TRANSLATE_PROVIDER=mymemory   (default) — free, no key, reliable, ~5k chars/day anonymous.
 *                                              Set MYMEMORY_EMAIL to lift the daily quota to ~50k.
 *   TRANSLATE_PROVIDER=libretranslate         — needs a working LIBRETRANSLATE_URL (the public
 *                                              instance at libretranslate.de is currently
 *                                              returning HTML / rate-walled).
 *
 * In both cases failures fall back to the original English string — the UI never crashes.
 */
type Provider = 'mymemory' | 'libretranslate';

const PROVIDER: Provider =
  (process.env.TRANSLATE_PROVIDER as Provider | undefined) === 'libretranslate'
    ? 'libretranslate'
    : 'mymemory';

const LIBRE_URL = `${(process.env.LIBRETRANSLATE_URL ?? 'https://libretranslate.de').replace(/\/+$/, '')}/translate`;
const LIBRE_KEY = process.env.LIBRETRANSLATE_API_KEY ?? '';
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL ?? '';

const CACHE_DIR = path.join(process.cwd(), '.next', 'cache', 'translations');
const memoryCache = new Map<string, string>();

function cacheKey(source: string, target: string, text: string): string {
  return crypto.createHash('sha1').update(`${source}::${target}::${text}`).digest('hex');
}

async function readDisk(key: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(CACHE_DIR, `${key}.txt`), 'utf8');
  } catch {
    return null;
  }
}

async function writeDisk(key: string, value: string): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(CACHE_DIR, `${key}.txt`), value, 'utf8');
  } catch {
    /* cache miss is non-fatal */
  }
}

async function safeFetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  }
  if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
    // Provider returned HTML (rate-limit page, captcha, error page).
    throw new Error(`Non-JSON response: ${text.slice(0, 120)}`);
  }
  return JSON.parse(text);
}

/* ---------------- MyMemory ---------------- */

interface MyMemoryResponse {
  responseData?: { translatedText?: string };
  responseStatus?: number;
  matches?: Array<{ translation?: string; quality?: string | number }>;
}

async function callMyMemory(text: string, source: string, target: string): Promise<string> {
  const params = new URLSearchParams({
    q: text,
    langpair: `${source}|${target}`,
  });
  if (MYMEMORY_EMAIL) params.set('de', MYMEMORY_EMAIL);

  const json = (await safeFetchJson(
    `https://api.mymemory.translated.net/get?${params.toString()}`,
  )) as MyMemoryResponse;

  const out = json.responseData?.translatedText;
  if (typeof out === 'string' && out.length > 0) return out;
  throw new Error('MyMemory returned no translation');
}

/* ---------------- LibreTranslate ---------------- */

interface LibreResponse {
  translatedText?: string;
  error?: string;
}

async function callLibreTranslate(text: string, source: string, target: string): Promise<string> {
  const body: Record<string, string> = { q: text, source, target, format: 'text' };
  if (LIBRE_KEY) body.api_key = LIBRE_KEY;

  const json = (await safeFetchJson(LIBRE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })) as LibreResponse;

  if (json.error) throw new Error(json.error);
  if (typeof json.translatedText === 'string') return json.translatedText;
  throw new Error('LibreTranslate returned no translation');
}

async function callProvider(text: string, source: string, target: string): Promise<string> {
  return PROVIDER === 'libretranslate'
    ? callLibreTranslate(text, source, target)
    : callMyMemory(text, source, target);
}

/* ---------------- Public API ---------------- */

export async function translateOne(text: string, target: string, source = 'en'): Promise<string> {
  if (!text.trim() || target === source) return text;

  const key = cacheKey(source, target, text);
  const mem = memoryCache.get(key);
  if (mem !== undefined) return mem;

  const disk = await readDisk(key);
  if (disk !== null) {
    memoryCache.set(key, disk);
    return disk;
  }

  try {
    const out = await callProvider(text, source, target);
    memoryCache.set(key, out);
    void writeDisk(key, out);
    return out;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[translate]', (err as Error).message);
    return text;
  }
}

export async function translateBatch(
  texts: string[],
  target: string,
  source = 'en',
): Promise<string[]> {
  if (target === source) return texts.slice();

  const out: string[] = new Array(texts.length);
  let cursor = 0;
  const concurrency = PROVIDER === 'libretranslate' ? 8 : 4;

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= texts.length) return;
      out[idx] = await translateOne(texts[idx], target, source);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, texts.length) }, worker));
  return out;
}
