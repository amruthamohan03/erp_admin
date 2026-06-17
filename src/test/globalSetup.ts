import { startTestDb, stopTestDb } from './dbHarness';

// vitest globalSetup hook. Runs once before any test file imports.
// Returning a teardown function so vitest invokes it on exit even when
// tests crash. The harness is idempotent — both setup() and teardown()
// no-op if already in their target state.

export default async function setup(): Promise<() => Promise<void>> {
  await startTestDb();
  return async () => {
    await stopTestDb();
  };
}
