import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { resolveUploadPath, uploadMimeFor } from '@/lib/storage';

// Serves everything under public/uploads. `/uploads/:path*` is rewritten here in
// next.config.js, so stored URLs are unchanged and nothing in the database or
// the UI had to move.
//
// WHY this exists rather than letting Next serve public/:
//
//   "Only assets that are in the public directory at build time will be served
//    by Next.js. Files added at request time won't be available."
//
// Every upload in this app is written at request time, so in a built deployment
// (`next build && next start`) every one of them 404s — avatars, signatures,
// document attachments and the branding logo alike. Locally it all worked,
// because `next dev` reads public/ from disk on each request. That split is what
// made it look like a corrupt file: the settings screen asked the server, which
// correctly reported the file present on disk, while the browser's <img> got an
// HTML 404 body and fired onError.
//
// Serving through a route handler behaves identically in dev and in production,
// which is the point — the failure only existed because those two differed.
//
// Access matches what public/ gave before: unauthenticated. The login screen has
// to render the branding logo before anyone has a session, so this cannot simply
// require auth. Narrowing the other buckets (avatars, signatures) to a session is
// worth doing, but it is an access-model change that would also affect the
// server-side print/PDF builders, so it is deliberately not bundled in here.

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path: string[] }> };

function notFound(): Response {
  // Plain text, not the JSON envelope: the caller is an <img> or a browser
  // navigation, and an envelope would be decoded as image bytes.
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const { path: segments } = await params;
  const resolved = resolveUploadPath(segments);
  if (!resolved) return notFound();

  const mime = uploadMimeFor(resolved);
  // Only the formats the uploader accepts are served. Anything else on disk —
  // however it got there — is not something this route will hand back.
  if (!mime) return notFound();

  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    return notFound();
  }
  if (!stat.isFile()) return notFound();

  const body = Readable.toWeb(createReadStream(resolved)) as ReadableStream;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(stat.size),
      // Upload filenames carry a timestamp and a random suffix and are never
      // rewritten in place, so a URL always names the same bytes. That is also
      // what makes a replaced favicon appear without a hard reload.
      'Cache-Control': 'public, max-age=31536000, immutable',
      // An uploaded SVG is markup that can carry script, and it would run on
      // this app's origin. The CSP neuters it without having to refuse SVG,
      // which is the format a logo actually wants to be.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
