import { NextRequest } from 'next/server';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clientInvoiceBankMapping, clientMaster, invoiceBankMaster } from '@/db/schema';
import { ok, requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit/recordAudit';
import { clientInvoiceBankMappingPutSchema } from '@/schemas';

// §4.1 — which of our bank accounts a client is invoiced through.
//
// GET /api/v1/client-invoice-bank-mapping?client_id=N
// PUT /api/v1/client-invoice-bank-mapping

// GET — every active invoice bank, joined with this client's mapping. Banks with
// no row come back unassigned so the matrix UI has a full list to render.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get('client_id');
  if (!raw) throw new BadRequestError('Select a client to see its invoice banks.');
  const clientId = Number(raw);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    throw new BadRequestError('Select a client to see its invoice banks.');
  }

  const [client] = await db
    .select({ id: clientMaster.id })
    .from(clientMaster)
    .where(and(eq(clientMaster.id, clientId), eq(clientMaster.display, 'Y')))
    .limit(1);
  if (!client) throw new NotFoundError('That client no longer exists.');

  const rows = await db
    .select({
      invoice_bank_id: invoiceBankMaster.id,
      invoice_bank_name: invoiceBankMaster.invoiceBankName,
      invoice_bank_account_name: invoiceBankMaster.invoiceBankAccountName,
      invoice_bank_account_number: invoiceBankMaster.invoiceBankAccountNumber,
      invoice_bank_swift: invoiceBankMaster.invoiceBankSwift,
      is_assigned: clientInvoiceBankMapping.id,
      is_default: clientInvoiceBankMapping.isDefault,
    })
    .from(invoiceBankMaster)
    .leftJoin(
      clientInvoiceBankMapping,
      and(
        eq(clientInvoiceBankMapping.invoiceBankId, invoiceBankMaster.id),
        eq(clientInvoiceBankMapping.clientId, clientId),
        eq(clientInvoiceBankMapping.display, 'Y'),
      ),
    )
    .where(eq(invoiceBankMaster.display, 'Y'))
    .orderBy(asc(invoiceBankMaster.id));

  const banks = rows.map((r) => ({
    ...r,
    is_assigned: r.is_assigned !== null,
    is_default: r.is_default ?? false,
  }));

  return ok({
    client_id: clientId,
    // Surfaced rather than left for the operator to notice: a client with banks
    // but no default is the state where an invoice cannot pick one on its own.
    needs_default: banks.some((b) => b.is_assigned) && !banks.some((b) => b.is_default),
    banks,
  });
});

// PUT — the whole matrix for one client, in one transaction.
//
// Un-assigned pairings are soft-deleted rather than removed (§4.27), so the
// history of who was invoiced through which account survives; re-assigning
// revives the same row instead of piling up duplicates.
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { client_id, mappings } = clientInvoiceBankMappingPutSchema.parse(await req.json());

  const [client] = await db
    .select({ id: clientMaster.id })
    .from(clientMaster)
    .where(eq(clientMaster.id, client_id))
    .limit(1);
  if (!client) throw new NotFoundError('That client no longer exists.');

  const assigned = mappings.filter((m) => m.is_assigned);
  const unassigned = mappings.filter((m) => !m.is_assigned).map((m) => m.invoice_bank_id);

  const result = await db.transaction(async (tx) => {
    const before = await tx
      .select({
        invoice_bank_id: clientInvoiceBankMapping.invoiceBankId,
        is_default: clientInvoiceBankMapping.isDefault,
      })
      .from(clientInvoiceBankMapping)
      .where(
        and(
          eq(clientInvoiceBankMapping.clientId, client_id),
          eq(clientInvoiceBankMapping.display, 'Y'),
        ),
      );

    // Clear first, assign second. The default is unique per client, so writing a
    // new default before retiring the old one would collide with a row this same
    // request is about to remove.
    if (unassigned.length > 0) {
      await tx
        .update(clientInvoiceBankMapping)
        .set({ display: 'N', isDefault: false, updatedBy: session.uid, updatedAt: new Date() })
        .where(
          and(
            eq(clientInvoiceBankMapping.clientId, client_id),
            inArray(clientInvoiceBankMapping.invoiceBankId, unassigned),
          ),
        );
    }

    // Drop every default before setting the new one, for the same reason.
    await tx
      .update(clientInvoiceBankMapping)
      .set({ isDefault: false, updatedBy: session.uid, updatedAt: new Date() })
      .where(
        and(
          eq(clientInvoiceBankMapping.clientId, client_id),
          eq(clientInvoiceBankMapping.isDefault, true),
        ),
      );

    for (const m of assigned) {
      // Revive-or-insert. A pairing that was un-assigned earlier still has its
      // row (soft-deleted), and the partial unique index only covers live ones,
      // so a plain insert would succeed and leave two rows for one pairing.
      const [existing] = await tx
        .select({ id: clientInvoiceBankMapping.id })
        .from(clientInvoiceBankMapping)
        .where(
          and(
            eq(clientInvoiceBankMapping.clientId, client_id),
            eq(clientInvoiceBankMapping.invoiceBankId, m.invoice_bank_id),
          ),
        )
        .limit(1);

      if (existing) {
        await tx
          .update(clientInvoiceBankMapping)
          .set({
            display: 'Y',
            isDefault: m.is_default,
            updatedBy: session.uid,
            updatedAt: new Date(),
          })
          .where(eq(clientInvoiceBankMapping.id, existing.id));
      } else {
        await tx.insert(clientInvoiceBankMapping).values({
          clientId: client_id,
          invoiceBankId: m.invoice_bank_id,
          isDefault: m.is_default,
          createdBy: session.uid,
          updatedBy: session.uid,
        });
      }
    }

    await recordAudit(tx, {
      actorId: session.uid,
      action: 'update',
      entityType: 'client_invoice_bank_mapping',
      entityId: String(client_id),
      module: 'mapping',
      before: { banks: before },
      after: {
        banks: assigned.map((m) => ({
          invoice_bank_id: m.invoice_bank_id,
          is_default: m.is_default,
        })),
      },
    });

    return { assigned: assigned.length, removed: unassigned.length };
  });

  return ok({ client_id, ...result });
});
