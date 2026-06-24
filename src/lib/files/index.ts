// Storage backend facade — route handlers call these functions; they
// never import the local/S3 helpers directly. Today only the local
// backend exists; an S3 swap is a one-file change here once
// credentials are configured.
//
// CLAUDE.md §4.11 — file bytes live in storage, metadata lives in
// `files_t`. Keep the two in sync: every put() must be paired with
// a `files_t` row insert in the calling transaction.

import {
  LOCAL_BUCKET,
  buildLocalKey,
  deleteLocalObject,
  readLocalObject,
  writeLocalObject,
} from './local';

export { LOCAL_BUCKET, slugifyName, buildLocalKey } from './local';

/**
 * Active bucket name for new uploads. Routes that record `files_t`
 * rows write this into the `bucket` column so a future S3 migration
 * can find/migrate the local rows distinctly.
 */
export function activeBucket(): string {
  return LOCAL_BUCKET;
}

/**
 * Allocate the storage key for a file given its target entity + the
 * `files_t.id` it will be paired with. Caller is responsible for
 * choosing a safe name (see `slugifyName`).
 */
export function buildStorageKey(args: {
  entityType: string | null;
  entityId: string | null;
  fileId: number;
  name: string;
}): string {
  return buildLocalKey(args);
}

export async function putObject(key: string, data: Buffer): Promise<void> {
  await writeLocalObject(key, data);
}

export async function getObject(key: string): Promise<Buffer> {
  return readLocalObject(key);
}

export async function deleteObject(key: string): Promise<void> {
  await deleteLocalObject(key);
}
