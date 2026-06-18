import { and, eq, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoiceT, clientMaster } from '@/db/schema';
import { BadRequestError } from '@/lib/errors';
import type { ReportHandler } from '../types';

// Invoices outstanding — currently in 'issued' state with a due_date on
// or before the supplied max_due_date. Joins on client_master_t for the
// legal name so finance can see who owes what.
//
// Parameters (validated by runReport against the linked form_definition):
//   max_due_date — date string 'YYYY-MM-DD' (required)
//
// Output columns: invoice_number, client_name, amount, currency, due_date,
// days_until_due (negative when overdue).

export const handler: ReportHandler = async (params) => {
  const maxDueDate = params?.max_due_date;
  if (typeof maxDueDate !== 'string') {
    // Defence in depth — runReport's Zod gate should already have caught this.
    throw new BadRequestError('max_due_date is required');
  }

  const rows = await db
    .select({
      invoice_number: invoiceT.invoiceNumber,
      client_name: clientMaster.legalName,
      amount: invoiceT.amount,
      currency: invoiceT.currency,
      due_date: invoiceT.dueDate,
      days_until_due: sql<number>`(${invoiceT.dueDate} - current_date)::int`,
    })
    .from(invoiceT)
    .innerJoin(clientMaster, eq(invoiceT.clientId, clientMaster.id))
    .where(
      and(
        eq(invoiceT.state, 'issued'),
        eq(invoiceT.display, 'Y'),
        lte(invoiceT.dueDate, maxDueDate),
      ),
    )
    .orderBy(invoiceT.dueDate);

  return rows.map((r) => ({
    invoice_number: r.invoice_number,
    client_name: r.client_name,
    amount: r.amount,
    currency: r.currency,
    due_date: r.due_date,
    days_until_due: r.days_until_due,
  }));
};
