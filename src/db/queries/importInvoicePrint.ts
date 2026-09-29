import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { loadBranding } from './branding';
import { renderInvoice } from '@/lib/invoiceTemplates/render';
import type { InvoiceDoc, InvoiceLine } from '@/lib/invoiceTemplates/types';
import { resolveInvoiceTemplate } from './invoiceTemplateResolve';
import { loadGridHeadings } from './invoiceGridHeadings';

// The import facture.
//
// This module now only READS — it assembles an `InvoiceDoc` and hands it to the
// shared renderer, which owns every layout (§4.10). Until 0126 the HTML lived
// here as one hardcoded design and `invoice_template` was stored and ignored;
// the design is configuration now, and the master's preview draws through the
// same `renderInvoice`, so what an operator approves is what a client receives.

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const str = (v: unknown): string => String(v ?? '');

/**
 * The category billed in CDF.
 *
 * Category 1 (customs disbursements) is quoted and printed in francs while
 * every other line is in dollars. The id is the legacy convention this module
 * has always used; it is isolated here rather than repeated so that when it
 * becomes a flag on the category master there is one line to change.
 */
const CDF_CATEGORY_ID = 1;

export async function buildImportInvoicePrintHtml(id: number): Promise<string | null> {
  // §4.1 — the letterhead names the deployment, not a hardcoded company. Comes
  // from Settings → Application, the same source as the app's own branding.
  const companyName = (await loadBranding()).project_name;
  const invRes = await db.execute(sql`
    SELECT inv.*, c.company_name, c.short_name, c.address, c.rccm_number, c.nif_number,
           c.id_nat_number, c.import_export_number,
           tm.transport_mode_name, tg.goods_type, l.license_number,
           su.signature_image AS sig_image, COALESCE(su.full_name, su.username) AS operator_name
    FROM import_invoices_t inv
    LEFT JOIN client_master_t c ON c.id = inv.client_id
    LEFT JOIN transport_mode_master_t tm ON tm.id = inv.transport_mode_id
    LEFT JOIN type_of_goods_master_t tg ON tg.id = inv.goods_type_id
    LEFT JOIN license_t l ON l.id = inv.license_id
    LEFT JOIN users_t su ON su.id = inv.created_by
    WHERE inv.id = ${id} AND inv.display = 'Y' LIMIT 1`);
  const inv = (invRes as unknown as { rows: Record<string, unknown>[] }).rows[0];
  if (!inv) return null;

  // Resolve the display name + category from item_master_t so legacy rows that
  // stored the item id in item_name (and left item_id / category null) still
  // print the real name and a proper category header. Effective item id =
  // item_id, else a purely-numeric item_name; category = the row's category_id
  // else the resolved item's category. Stored text still wins when a real name
  // was typed with no master link (im.* is null → COALESCE falls through).
  const itemsRes = await db.execute(sql`
    SELECT COALESCE(eii.category_id, im.category_id) AS category_id,
           COALESCE(eii.category_header, eii.category_name, qc.category_header, qc.category_name, 'UNCATEGORIZED') AS category_header,
           COALESCE(im.item_name, NULLIF(eii.item_name, '')) AS item_name,
           eii.unit_text, eii.unit_name, eii.quantity, eii.taux_usd, eii.subtotal_usd,
           eii.tva_usd, eii.total_usd, eii.rate_cdf, eii.vat_cdf, eii.total_cdf,
           eii.sort_order, eii.id
    FROM import_invoice_items_t eii
    LEFT JOIN item_master_t im
      ON im.id = COALESCE(eii.item_id, CASE WHEN eii.item_name ~ '^[0-9]+$' THEN eii.item_name::int END)
    LEFT JOIN quotation_category_master_t qc ON qc.id = COALESCE(eii.category_id, im.category_id)
    WHERE eii.invoice_id = ${id} AND eii.display = 'Y'
    ORDER BY category_id ASC, eii.sort_order ASC, eii.id ASC`);

  const rateBcc = num(inv.rate_cdf_usd_bcc) || 2500;
  const rateInv = num(inv.rate_cdf_inv) || 2500;

  const lines: InvoiceLine[] = (
    itemsRes as unknown as { rows: Record<string, unknown>[] }
  ).rows.map((r) => {
    const categoryId = num(r.category_id);
    const rateCdf = num(r.rate_cdf);
    const vatCdf = num(r.vat_cdf);

    // A CDF line carries its USD EQUIVALENT in the usd columns, converted at
    // the BCC rate. That is how the facture has always totalled — the grand
    // total is in dollars whatever the individual lines are billed in — and
    // putting the conversion here means the renderer can sum one pair of
    // columns for every line instead of knowing about currencies.
    const isCdf = categoryId === CDF_CATEGORY_ID;
    const subtotalUsd = isCdf
      ? rateBcc > 0
        ? rateCdf / rateBcc
        : 0
      : num(r.subtotal_usd) || num(r.quantity) * num(r.taux_usd);
    const tvaUsd = isCdf ? (rateBcc > 0 ? vatCdf / rateBcc : 0) : num(r.tva_usd);

    return {
      category_id: categoryId,
      category_header: str(r.category_header) || 'UNCATEGORIZED',
      item_name: str(r.item_name),
      unit: str(r.unit_text) || str(r.unit_name) || 'Unit',
      quantity: num(r.quantity),
      taux_usd: num(r.taux_usd),
      subtotal_usd: subtotalUsd,
      tva_usd: tvaUsd,
      total_usd: subtotalUsd + tvaUsd,
      rate_cdf: rateCdf,
      vat_cdf: vatCdf,
      total_cdf: num(r.total_cdf),
    };
  });

  const doc: InvoiceDoc = {
    company_name: companyName,
    invoice_ref: str(inv.invoice_ref),
    created_at: inv.created_at == null ? null : String(inv.created_at),
    validated: num(inv.validated),
    client_name: str(inv.company_name),
    address: str(inv.address),
    rccm_number: str(inv.rccm_number),
    nif_number: str(inv.nif_number),
    id_nat_number: str(inv.id_nat_number),
    transport_mode_name: str(inv.transport_mode_name),
    produit: str(inv.produit),
    license_number: str(inv.license_number),
    declaration_no: str(inv.declaration_no),
    declaration_date: inv.declaration_date == null ? null : String(inv.declaration_date),
    liquidation_no: str(inv.liquidation_no),
    liquidation_date: inv.liquidation_date == null ? null : String(inv.liquidation_date),
    quittance_no: str(inv.quittance_no),
    quittance_date: inv.quittance_date == null ? null : String(inv.quittance_date),
    payment_method: str(inv.payment_method),
    poids_kg: num(inv.poids_kg),
    cif_usd: num(inv.cif_usd),
    cif_cdf: num(inv.cif_cdf),
    rate_bcc: rateBcc,
    rate_inv: rateInv,
    // Only on a validated invoice, and only if the creator has one — the
    // renderer applies the template's own showSignature on top.
    signature_image: num(inv.validated) >= 1 && inv.sig_image ? str(inv.sig_image) : null,
    operator_name: str(inv.operator_name),
    cdf_category_ids: [CDF_CATEGORY_ID],
    lines,
    // §4.1, §4.10 — the same column names the editable grid shows. Without this
    // the operator renames a column on screen and the client still reads the
    // old label on the facture.
    headings: await loadGridHeadings(),
  };

  const template = await resolveInvoiceTemplate(
    inv.invoice_template == null ? null : String(inv.invoice_template),
  );

  return renderInvoice(doc, template, { interactive: true });
}
