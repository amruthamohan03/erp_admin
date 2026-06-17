import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    // Default node environment — lib + route handler tests don't need jsdom.
    // When component tests land, override per-file with @vitest-environment jsdom.
    environment: 'node',
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'src/**/__tests__/**/*.{test,spec}.{ts,tsx}',
    ],
    // Integration tests live in *.integration.test.ts and need the DB
    // harness from vitest.integration.config.ts. Excluding them here keeps
    // `npm run test` fast for unit-only workflows.
    exclude: ['**/node_modules/**', '**/*.integration.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
