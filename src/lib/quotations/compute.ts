// Server-side quotation math — the single source of truth for line + header totals
// (USD: qty×taux or cost, +16% VAT, +1.2% ARSP; CDF: rate + 16% VAT for the
// Import-Definitive customs section). Mirrors the legacy prepareQuotationData /
// prepareItemData so the client's numbers are recomputed, never trusted.
import { z } from 'zod';
import type { QuotationInsert, QuotationItemInsert } from '@/db/schema';

const VAT_RATE = 0.16;
const ARSP_RATE = 0.012;

export const quotationItemSchema = z.object({
  category_id: z.coerce.number().int().positive().nullable().optional(),
  item_id: z.coerce.number().int().positive().nullable().optional(),
  unit_id: z.coerce.number().int().positive().nullable().optional(),
  currency_id: z.coerce.number().int().positive().nullable().optional(),
  has_tva: z.boolean().optional(),
  quantity: z.coerce.number().optional(),
  cost_usd: z.coerce.number().optional(),
  taux_usd: z.coerce.number().optional(),
  cif_split: z.coerce.number().optional(),
  percentage: z.coerce.number().optional(),
  rate_cdf: z.coerce.number().optional(),
});

export const quotationBodySchema = z.object({
  client_id: z.coerce.number().int().positive(),
  quotation_ref: z.string().min(1).max(255),
  quotation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  kind_id: z.coerce.number().int().positive().nullable().optional(),
  transport_mode_id: z.coerce.number().int().positive().nullable().optional(),
  goods_type_id: z.coerce.number().int().positive().nullable().optional(),
  arsp: z.enum(['Enabled', 'Disabled']).optional(),
  items: z.array(quotationItemSchema),
});

export type QuotationBody = z.infer<typeof quotationBodySchema>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;
const dec = (n: number, scale = 2): string => n.toFixed(scale);

type HeaderValues = Omit<QuotationInsert, 'id' | 'display' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>;
type ItemValues = Omit<QuotationItemInsert, 'id' | 'quotationId' | 'display' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>;

export function buildQuotation(
  input: QuotationBody,
  kindName: string,
  customsByCat: Map<number, boolean>,
): { header: HeaderValues; items: ItemValues[] } {
  const k = (kindName || '').toUpperCase();
  const isED = k.includes('EXPORT');
  const isImportDefinitive = k.includes('DEFINIT'); // matches "IMPORT DEFINITVE"
  const arspEnabled = input.arsp === 'Enabled';

  let subUsd = 0;
  let vatUsd = 0;
  let subCdf = 0;
  let vatCdf = 0;
  let arspBase = 0;

  const items: ItemValues[] = [];

  for (const it of input.items) {
    if (!it.item_id) continue; // skip empty rows (no description chosen)
    const isCustoms = it.category_id ? !!customsByCat.get(it.category_id) : false;
    const common = {
      categoryId: it.category_id ?? null,
      itemId: it.item_id ?? null,
      unitId: it.unit_id ?? null,
      currencyId: it.currency_id ?? null,
      hasTva: !!it.has_tva,
    };

    if (isImportDefinitive && isCustoms) {
      const rate = num(it.rate_cdf);
      const vat = round2(rate * VAT_RATE);
      items.push({
        ...common,
        quantity: '1', tauxUsd: '0', costUsd: '0', subtotalUsd: '0', tvaUsd: '0', totalUsd: '0',
        cifSplit: dec(num(it.cif_split)), percentage: dec(num(it.percentage), 4),
        rateCdf: dec(rate), vatCdf: dec(vat), totalCdf: dec(rate + vat),
      });
      subCdf += rate;
      vatCdf += vat;
    } else if (isED) {
      const cost = num(it.cost_usd);
      const tva = common.hasTva ? round2(cost * VAT_RATE) : 0;
      items.push({
        ...common,
        quantity: '1', costUsd: dec(cost), subtotalUsd: dec(cost), tauxUsd: '0',
        tvaUsd: dec(tva), totalUsd: dec(cost + tva),
        cifSplit: '0', percentage: '0', rateCdf: '0', vatCdf: '0', totalCdf: '0',
      });
      subUsd += cost;
      vatUsd += tva;
      if (common.hasTva) arspBase += cost;
    } else {
      const qty = num(it.quantity);
      const taux = num(it.taux_usd);
      const line = qty * taux;
      const tva = common.hasTva ? round2(line * VAT_RATE) : 0;
      items.push({
        ...common,
        quantity: dec(qty), tauxUsd: dec(taux), costUsd: '0', subtotalUsd: '0',
        tvaUsd: dec(tva), totalUsd: dec(line + tva),
        cifSplit: '0', percentage: '0', rateCdf: '0', vatCdf: '0', totalCdf: '0',
      });
      subUsd += line;
      vatUsd += tva;
      if (common.hasTva) arspBase += line;
    }
  }

  const arspAmount = arspEnabled ? round2(arspBase * ARSP_RATE) : 0;
  const totalUsd = subUsd + vatUsd + arspAmount;
  const totalCdf = subCdf + vatCdf;

  const header: HeaderValues = {
    clientId: input.client_id,
    quotationRef: input.quotation_ref,
    quotationDate: input.quotation_date ?? null,
    subTotal: dec(subUsd),
    vatAmount: dec(vatUsd),
    arspAmount: dec(arspAmount),
    totalAmount: dec(totalUsd),
    subTotalCdf: dec(subCdf),
    vatAmountCdf: dec(vatCdf),
    totalAmountCdf: dec(totalCdf),
    arsp: input.arsp ?? 'Disabled',
    kindId: input.kind_id ?? null,
    transportModeId: input.transport_mode_id ?? null,
    goodsTypeId: input.goods_type_id ?? null,
  };

  return { header, items };
}
