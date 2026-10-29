import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { filesT } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';
import { activeBucket, buildStorageKey, putObject, slugifyName } from '@/lib/files';

export interface StoredFile {
  id: number;
  key: string;
  sha256: string;
  size: number;
}

/**
 * Write one file's bytes to the storage backend and its files_t row.
 *
 * Two-phase because the key embeds the row id — insert with a placeholder key,
 * then write the bytes under the real key. Run it inside the caller's
 * transaction so a failed write rolls the row back with everything else.
 */
export async function storeFile(
  tx: Database | Transaction,
  args: {
    bytes: Buffer;
    name: string;
    mime: string | null;
    uploaderId: number;
    entityType: string | null;
    entityId: string | null;
  },
): Promise<StoredFile> {
  const sha256 = crypto.createHash('sha256').update(args.bytes).digest('hex');
  const [row] = await tx
    .insert(filesT)
    .values({
      bucket: activeBucket(),
      key: 'pending',
      mime: args.mime || null,
      size: args.bytes.length,
      sha256,
      originalName: args.name,
      uploaderId: args.uploaderId,
      entityType: args.entityType,
      entityId: args.entityId,
      status: 'committed',
    })
    .returning({ id: filesT.id });

  const key = buildStorageKey({
    entityType: args.entityType,
    entityId: args.entityId,
    fileId: row.id,
    name: slugifyName(args.name),
  });
  await putObject(key, args.bytes);
  await tx.update(filesT).set({ key }).where(eq(filesT.id, row.id));
  return { id: row.id, key, sha256, size: args.bytes.length };
}
