// Hosts allowed to pull dev resources (/_next/webpack-hmr and friends). Next
// blocks cross-origin dev requests by default, so reaching `next dev` on a
// remote box by IP or hostname fails until that origin is listed. Kept in the
// environment rather than the repo so a staging address isn't committed:
//
//   NEXT_ALLOWED_DEV_ORIGINS=206.189.129.39,staging.example.com
//
// Only consulted by `next dev` — production (`next build && next start`) does
// not serve dev resources and ignores this.
const allowedDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins,
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  async rewrites() {
    return {
      // `beforeFiles` on purpose: this must win over the static handler in BOTH
      // dev and production. Next only serves files that were in public/ when the
      // build ran, so an upload written at request time 404s once built — while
      // `next dev` serves it happily from disk. Routing every /uploads request
      // through the handler removes that dev/prod split rather than papering
      // over it, so what an operator sees locally is what they get deployed.
      beforeFiles: [{ source: '/uploads/:path*', destination: '/api/v1/uploads/:path*' }],
      afterFiles: [],
      fallback: [],
    };
  },
};

module.exports = nextConfig;
