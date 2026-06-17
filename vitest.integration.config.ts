import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Integration test config — only runs files under src/**/*.integration.test.ts.
// Unit tests (everything else) keep using vitest.config.ts and `npm run test`.
//
// Pulling the harness up once via globalSetup means a single Postgres
// container (or single TEST_DATABASE_URL connection) services every
// integration test file — way cheaper than per-suite start/stop.

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./src/test/globalSetup.ts'],
    environment: 'node',
    // Containers can take a beat to come up. Tighten if you're using
    // TEST_DATABASE_URL.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
