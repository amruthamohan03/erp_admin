// POST /api/v1/data-import/commit
//
// Creates the reviewed rows by posting each one to the module's own save route
// as the signed-in operator (db/queries/dataImport.ts). Each row reports its own
// outcome: one bad row does not stop the rest, and what failed is kept with its
// reason so the operator can fix those rows and upload them again.
import { NextRequest } from 'next/server';
import { ok, fail, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { importCommitSchema } from '@/schemas';
import {
  commitRows,
  getImportTarget,
  importTargetFields,
  recordBatch,
  rememberAliases,
} from '@/db/queries/dataImport';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = importCommitSchema.parse(await req.json());
  const target = await getImportTarget(body.target_key);

  const session = await requirePermission(target.menu_url, 'import');
  if (isResponse(session)) return session;

  const cookie = req.headers.get('cookie');
  if (!cookie) return fail('Your session could not be read — sign in again and retry the import.', 401);

  const fields = await importTargetFields(target);
  const results = await commitRows(target, fields, body.rows, {
    origin: new URL(req.url).origin,
    cookie,
  });

  if (body.remember_mapping) await rememberAliases(target.id, body.mapping, session.uid);

  const batchId = await recordBatch({
    targetKey: target.target_key,
    fileName: body.file_name,
    source: body.source,
    mapping: body.mapping,
    results,
    actorId: session.uid,
  });

  const created = results.filter((r) => r.record_id !== null).length;
  return ok({
    batch_id: batchId,
    created,
    failed: results.length - created,
    results,
  });
});
