// POST /api/v1/data-import/parse  (multipart: target_key, file)
//
// Reads the upload and hands the screen something to review — never writes a
// business record. A spreadsheet comes back as headings, rows and a suggested
// mapping; a scan comes back as one row of field values read by the model, with
// whatever it was unsure about.
//
// Gated on Import permission for the TARGET's own menu, so whoever may not add
// licences may not import them either.
import { NextRequest } from 'next/server';
import { ok, fail, requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { getImportTarget, importTargetFields, loadAliases } from '@/db/queries/dataImport';
import { parseSpreadsheet, uploadKind } from '@/lib/dataImport/parseFile';
import { extractDocument } from '@/lib/dataImport/extractDocument';
import { suggestMapping } from '@/lib/dataImport/mapping';
import { importTargetKeySchema } from '@/schemas';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const form = await req.formData().catch(() => null);
  if (!form) return fail('Upload a file to import.', 400, { field: 'file' });

  const targetKey = importTargetKeySchema.parse(form.get('target_key'));
  const target = await getImportTarget(targetKey);

  const session = await requirePermission(target.menu_url, 'import');
  if (isResponse(session)) return session;

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return fail('Choose a file to import — a spreadsheet (.xlsx, .csv) or a scan (.pdf, .png, .jpg).', 422, { field: 'file' });
  }

  const kind = uploadKind(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const [fields, aliases] = await Promise.all([importTargetFields(target), loadAliases(target.id)]);

  if (kind === 'spreadsheet') {
    const sheet = await parseSpreadsheet(buffer, file.name);
    return ok({
      source: 'spreadsheet' as const,
      target,
      fields,
      file_name: file.name,
      sheet_name: sheet.sheetName ?? null,
      headings: sheet.headings,
      rows: sheet.rows,
      mapping: suggestMapping(sheet.headings, fields, { aliases }),
      notes: null,
    });
  }

  // A scan is one record. Its values come back keyed by field name already, so
  // the mapping is the identity — the review screen shows them for correction.
  const extracted = await extractDocument(buffer, file.name, target.name, fields);
  const headings = fields.filter((f) => extracted.values[f.name] !== undefined).map((f) => f.label);
  return ok({
    source: 'document' as const,
    target,
    fields,
    file_name: file.name,
    sheet_name: null,
    headings,
    rows: [Object.fromEntries(fields.map((f) => [f.label, extracted.values[f.name] ?? '']))],
    mapping: Object.fromEntries(fields.map((f) => [f.label, f.name])),
    notes: extracted.notes,
  });
});
