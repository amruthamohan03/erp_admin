// GET /api/clients/export-all → CSV download of all active clients.
// Returns a summary view (12 columns) suitable for spreadsheets — the per-client
// endpoint returns the full record.
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  clients,
  groupCompanyMaster,
  industryMaster,
  refererMaster,
  officeLocationMaster,
  phaseMaster,
} from '@/db/schema';
import { getSession } from '@/lib/auth';
import { fail } from '@/lib/api';
import { toCsv, csvResponse, dateStamp } from '@/lib/csv';

export async function GET() {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const rows = await db
    .select({
      id: clients.id,
      company_name: clients.companyName,
      short_name: clients.shortName,
      client_type: clients.clientType,
      group_company: groupCompanyMaster.groupCompanyName,
      industry: industryMaster.industryName,
      referred_by: refererMaster.refererName,
      office_location: officeLocationMaster.locationName,
      phase: phaseMaster.phaseName,
      contact_person: clients.contactPerson,
      email: clients.email,
      phone: clients.phone,
      payment_term: clients.paymentTerm,
      credit_term: clients.creditTerm,
      display: clients.display,
      created_at: clients.createdAt,
    })
    .from(clients)
    .leftJoin(groupCompanyMaster,    eq(clients.groupCompanyId,    groupCompanyMaster.id))
    .leftJoin(industryMaster,        eq(clients.industryTypeId,    industryMaster.id))
    .leftJoin(refererMaster,         eq(clients.referredById,      refererMaster.id))
    .leftJoin(officeLocationMaster,  eq(clients.officeLocationId,  officeLocationMaster.id))
    .leftJoin(phaseMaster,           eq(clients.phaseId,           phaseMaster.id))
    .where(eq(clients.display, 'Y'))
    .orderBy(asc(clients.companyName));

  const csv = toCsv(rows, [
    { key: 'id',              header: 'ID' },
    { key: 'company_name',    header: 'Company Name' },
    { key: 'short_name',      header: 'Code' },
    { key: 'client_type',     header: 'Type' },
    { key: 'group_company',   header: 'Group Company' },
    { key: 'industry',        header: 'Industry' },
    { key: 'referred_by',     header: 'Referred By' },
    { key: 'office_location', header: 'Location' },
    { key: 'phase',           header: 'Phase' },
    { key: 'contact_person',  header: 'Contact Person' },
    { key: 'email',           header: 'Email' },
    { key: 'phone',           header: 'Phone' },
    { key: 'payment_term',    header: 'Payment Term' },
    { key: 'credit_term',     header: 'Credit Term (days)' },
    { key: 'display',         header: 'Status' },
    { key: 'created_at',      header: 'Created At' },
  ]);

  return csvResponse(csv, `clients-export-all.csv`);
}
