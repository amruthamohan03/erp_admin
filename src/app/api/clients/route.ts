// List endpoint for the /clients page. Mutations on a single client go through
// the §4.12 transactional-page API at /api/pages/clients/[id].
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clients } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: clients.id,
      company_name: clients.companyName,
      short_name: clients.shortName,
      client_type: clients.clientType,
      contact_person: clients.contactPerson,
      email: clients.email,
      phone: clients.phone,
      display: clients.display,
      created_at: clients.createdAt,
      updated_at: clients.updatedAt,
    })
    .from(clients)
    .where(eq(clients.display, 'Y'))
    .orderBy(asc(clients.companyName));

  return ok(rows);
}
