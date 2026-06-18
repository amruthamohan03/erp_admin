import { NextRequest } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { formDefinitionMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';

// GET /api/v1/forms
// List active form definitions for the admin matrix UI. Returns the
// presentation fields only; field rows hang off /api/v1/forms/{formKey}.

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const rows = await db
    .select({
      id: formDefinitionMaster.id,
      formKey: formDefinitionMaster.formKey,
      name: formDefinitionMaster.name,
      description: formDefinitionMaster.description,
      entityType: formDefinitionMaster.entityType,
    })
    .from(formDefinitionMaster)
    .where(eq(formDefinitionMaster.display, 'Y'))
    .orderBy(asc(formDefinitionMaster.entityType), asc(formDefinitionMaster.name));

  return ok(rows);
});
