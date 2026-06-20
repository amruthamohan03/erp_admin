import { describe, it, expect } from 'vitest';
import {
  buildQuotation,
  quotationBodySchema,
  __TEST__,
  type QuotationBody,
} from './compute';

// Pure-math coverage of buildQuotation. compute.ts is THE quotation
// money-correctness boundary — every code path + edge case gets pinned.

const VAT = __TEST__.VAT_RATE; // 0.16
const ARSP = __TEST__.ARSP_RATE; // 0.012

function base(items: QuotationBody['items'] = []): QuotationBody {
  return {
    client_id: 1,
    quotation_ref: 'Q-001',
    items,
  };
}

const NO_CUSTOMS = new Map<number, boolean>();
const WITH_CUSTOMS = (id: number) => new Map<number, boolean>([[id, true]]);

describe('rate constants', () => {
  it('VAT_RATE is 16%', () => {
    expect(VAT).toBe(0.16);
  });
  it('ARSP_RATE is 1.2%', () => {
    expect(ARSP).toBe(0.012);
  });
});

describe('detectKind via kindName (substring on uppercased)', () => {
  // Detection is exercised through buildQuotation; we just confirm the
  // routing here by checking which columns get populated.

  it('"" (no kind) → default path (qty × taux)', () => {
    const { items, header } = buildQuotation(
      base([{ item_id: 1, quantity: 2, taux_usd: 5 }]),
      '',
      NO_CUSTOMS,
    );
    expect(items[0].subtotalUsd).toBe('0');
    expect(items[0].tauxUsd).toBe('5.00');
    expect(header.subTotal).toBe('10.00');
    expect(header.subTotalCdf).toBe('0.00');
  });

  it('"Export" → export path (cost_usd)', () => {
    const { items, header } = buildQuotation(
      base([{ item_id: 1, cost_usd: 50 }]),
      'Export',
      NO_CUSTOMS,
    );
    expect(items[0].costUsd).toBe('50.00');
    expect(items[0].tauxUsd).toBe('0');
    expect(header.subTotal).toBe('50.00');
  });

  it('"EXPORT" → export path (case insensitive)', () => {
    const { header } = buildQuotation(
      base([{ item_id: 1, cost_usd: 25 }]),
      'EXPORT',
      NO_CUSTOMS,
    );
    expect(header.subTotal).toBe('25.00');
  });

  it('"Import Definitive" + customs → CDF path', () => {
    const { items, header } = buildQuotation(
      base([{ item_id: 1, category_id: 7, rate_cdf: 1000 }]),
      'Import Definitive',
      WITH_CUSTOMS(7),
    );
    expect(items[0].rateCdf).toBe('1000.00');
    expect(items[0].subtotalUsd).toBe('0');
    expect(header.subTotalCdf).toBe('1000.00');
  });

  it('"IMPORT DEFINITVE" (legacy typo) also → CDF path', () => {
    const { header } = buildQuotation(
      base([{ item_id: 1, category_id: 7, rate_cdf: 500 }]),
      'IMPORT DEFINITVE',
      WITH_CUSTOMS(7),
    );
    expect(header.subTotalCdf).toBe('500.00');
  });

  it('"Import Temporary" → default path (not import-definitive)', () => {
    const { header } = buildQuotation(
      base([{ item_id: 1, quantity: 2, taux_usd: 10 }]),
      'Import Temporary',
      NO_CUSTOMS,
    );
    expect(header.subTotal).toBe('20.00');
    expect(header.subTotalCdf).toBe('0.00');
  });
});

describe('default path (qty × taux)', () => {
  it('computes line × taux into subTotal', () => {
    const { header } = buildQuotation(
      base([{ item_id: 1, quantity: 3, taux_usd: 25 }]),
      'Import Temporary',
      NO_CUSTOMS,
    );
    expect(header.subTotal).toBe('75.00');
    expect(header.vatAmount).toBe('0.00');
    expect(header.totalAmount).toBe('75.00');
  });

  it('adds 16% VAT only when has_tva=true', () => {
    const { items, header } = buildQuotation(
      base([{ item_id: 1, quantity: 4, taux_usd: 25, has_tva: true }]),
      '',
      NO_CUSTOMS,
    );
    // line = 100, vat = 16
    expect(items[0].tvaUsd).toBe('16.00');
    expect(items[0].totalUsd).toBe('116.00');
    expect(header.vatAmount).toBe('16.00');
    expect(header.totalAmount).toBe('116.00');
  });

  it('omits VAT when has_tva is false / missing', () => {
    const { items, header } = buildQuotation(
      base([{ item_id: 1, quantity: 4, taux_usd: 25 }]),
      '',
      NO_CUSTOMS,
    );
    expect(items[0].tvaUsd).toBe('0.00');
    expect(header.vatAmount).toBe('0.00');
  });

  it('treats missing qty/taux as 0 (skipped from totals)', () => {
    const { header } = buildQuotation(
      base([{ item_id: 1 }]),
      '',
      NO_CUSTOMS,
    );
    expect(header.subTotal).toBe('0.00');
  });

  it('rounds VAT to 2 decimals (banker-safe)', () => {
    // 33.33 × 0.16 = 5.3328 → 5.33
    const { items } = buildQuotation(
      base([{ item_id: 1, quantity: 1, taux_usd: 33.33, has_tva: true }]),
      '',
      NO_CUSTOMS,
    );
    expect(items[0].tvaUsd).toBe('5.33');
  });
});

describe('export path (cost_usd)', () => {
  it('uses cost_usd directly as subtotal', () => {
    const { items, header } = buildQuotation(
      base([{ item_id: 1, cost_usd: 100 }]),
      'Export',
      NO_CUSTOMS,
    );
    expect(items[0].costUsd).toBe('100.00');
    expect(items[0].subtotalUsd).toBe('100.00');
    expect(items[0].quantity).toBe('1');
    expect(header.subTotal).toBe('100.00');
  });

  it('adds 16% VAT only when has_tva=true', () => {
    const { items, header } = buildQuotation(
      base([{ item_id: 1, cost_usd: 100, has_tva: true }]),
      'Export',
      NO_CUSTOMS,
    );
    expect(items[0].tvaUsd).toBe('16.00');
    expect(items[0].totalUsd).toBe('116.00');
    expect(header.vatAmount).toBe('16.00');
  });

  it('zeroes CDF + taux columns', () => {
    const { items } = buildQuotation(
      base([{ item_id: 1, cost_usd: 50 }]),
      'Export',
      NO_CUSTOMS,
    );
    expect(items[0].tauxUsd).toBe('0');
    expect(items[0].rateCdf).toBe('0');
    expect(items[0].vatCdf).toBe('0');
    expect(items[0].totalCdf).toBe('0');
  });
});

describe('Import-Definitive customs path (CDF)', () => {
  it('uses rate_cdf with 16% VAT', () => {
    const { items, header } = buildQuotation(
      base([{ item_id: 1, category_id: 7, rate_cdf: 1000 }]),
      'Import Definitive',
      WITH_CUSTOMS(7),
    );
    expect(items[0].rateCdf).toBe('1000.00');
    expect(items[0].vatCdf).toBe('160.00');
    expect(items[0].totalCdf).toBe('1160.00');
    expect(header.subTotalCdf).toBe('1000.00');
    expect(header.vatAmountCdf).toBe('160.00');
    expect(header.totalAmountCdf).toBe('1160.00');
  });

  it('persists cif_split and percentage (4dp)', () => {
    const { items } = buildQuotation(
      base([
        {
          item_id: 1,
          category_id: 7,
          rate_cdf: 500,
          cif_split: 250.5,
          percentage: 0.3333,
        },
      ]),
      'Import Definitive',
      WITH_CUSTOMS(7),
    );
    expect(items[0].cifSplit).toBe('250.50');
    expect(items[0].percentage).toBe('0.3333');
  });

  it('zeroes USD columns + quantity=1', () => {
    const { items, header } = buildQuotation(
      base([{ item_id: 1, category_id: 7, rate_cdf: 100 }]),
      'Import Definitive',
      WITH_CUSTOMS(7),
    );
    expect(items[0].quantity).toBe('1');
    expect(items[0].tauxUsd).toBe('0');
    expect(items[0].costUsd).toBe('0');
    expect(items[0].subtotalUsd).toBe('0');
    expect(items[0].tvaUsd).toBe('0');
    expect(items[0].totalUsd).toBe('0');
    expect(header.subTotal).toBe('0.00');
  });

  it('non-customs category in Import-Definitive → falls to default path', () => {
    const { items, header } = buildQuotation(
      base([
        // category_id=7 is NOT in the customs map → default path
        { item_id: 1, category_id: 7, quantity: 2, taux_usd: 50 },
      ]),
      'Import Definitive',
      NO_CUSTOMS, // empty map
    );
    expect(items[0].subtotalUsd).toBe('0');
    expect(items[0].tauxUsd).toBe('50.00');
    expect(header.subTotal).toBe('100.00');
    expect(header.subTotalCdf).toBe('0.00');
  });

  it('export kind ignores is_customs (always cost path)', () => {
    const { items, header } = buildQuotation(
      base([{ item_id: 1, category_id: 7, cost_usd: 80 }]),
      'Export',
      WITH_CUSTOMS(7),
    );
    expect(items[0].costUsd).toBe('80.00');
    expect(items[0].rateCdf).toBe('0');
    expect(header.subTotal).toBe('80.00');
    expect(header.subTotalCdf).toBe('0.00');
  });
});

describe('ARSP (1.2% fee on has_tva subtotal)', () => {
  it('computes ARSP when Enabled + has_tva lines exist', () => {
    const { header } = buildQuotation(
      {
        ...base([
          { item_id: 1, quantity: 1, taux_usd: 1000, has_tva: true },
        ]),
        arsp: 'Enabled',
      },
      '',
      NO_CUSTOMS,
    );
    // base = 1000, arsp = 12
    expect(header.arspAmount).toBe('12.00');
    expect(header.totalAmount).toBe('1172.00'); // 1000 + 160 + 12
  });

  it('arspAmount=0 when Disabled even with has_tva', () => {
    const { header } = buildQuotation(
      {
        ...base([
          { item_id: 1, quantity: 1, taux_usd: 1000, has_tva: true },
        ]),
        arsp: 'Disabled',
      },
      '',
      NO_CUSTOMS,
    );
    expect(header.arspAmount).toBe('0.00');
    expect(header.totalAmount).toBe('1160.00'); // 1000 + 160 + 0
  });

  it('arspAmount=0 when Enabled but no has_tva lines', () => {
    const { header } = buildQuotation(
      {
        ...base([{ item_id: 1, quantity: 1, taux_usd: 500 }]),
        arsp: 'Enabled',
      },
      '',
      NO_CUSTOMS,
    );
    expect(header.arspAmount).toBe('0.00');
  });

  it('accumulates base across multiple has_tva lines (default path)', () => {
    const { header } = buildQuotation(
      {
        ...base([
          { item_id: 1, quantity: 2, taux_usd: 100, has_tva: true },
          { item_id: 2, quantity: 1, taux_usd: 50, has_tva: true },
          // Non-has_tva line shouldn't contribute to ARSP base
          { item_id: 3, quantity: 10, taux_usd: 10 },
        ]),
        arsp: 'Enabled',
      },
      '',
      NO_CUSTOMS,
    );
    // base = 200 + 50 = 250; arsp = 3
    expect(header.arspAmount).toBe('3.00');
  });

  it('accumulates base from export has_tva lines', () => {
    const { header } = buildQuotation(
      {
        ...base([
          { item_id: 1, cost_usd: 100, has_tva: true },
          { item_id: 2, cost_usd: 200, has_tva: true },
        ]),
        arsp: 'Enabled',
      },
      'Export',
      NO_CUSTOMS,
    );
    // base = 300; arsp = 3.6
    expect(header.arspAmount).toBe('3.60');
  });

  it('CDF customs lines do NOT contribute to ARSP base', () => {
    const { header } = buildQuotation(
      {
        ...base([{ item_id: 1, category_id: 7, rate_cdf: 100000 }]),
        arsp: 'Enabled',
      },
      'Import Definitive',
      WITH_CUSTOMS(7),
    );
    expect(header.arspAmount).toBe('0.00');
  });

  it('defaults to Disabled when arsp field absent', () => {
    const { header } = buildQuotation(
      base([{ item_id: 1, quantity: 1, taux_usd: 100, has_tva: true }]),
      '',
      NO_CUSTOMS,
    );
    expect(header.arsp).toBe('Disabled');
    expect(header.arspAmount).toBe('0.00');
  });
});

describe('empty / sparse inputs', () => {
  it('returns zero-header + empty items for no inputs', () => {
    const { header, items } = buildQuotation(base([]), '', NO_CUSTOMS);
    expect(items).toEqual([]);
    expect(header.subTotal).toBe('0.00');
    expect(header.vatAmount).toBe('0.00');
    expect(header.totalAmount).toBe('0.00');
    expect(header.subTotalCdf).toBe('0.00');
    expect(header.arsp).toBe('Disabled');
  });

  it('skips rows with no item_id (empty form rows)', () => {
    const { items, header } = buildQuotation(
      base([
        { item_id: null, quantity: 5, taux_usd: 100 },
        { item_id: undefined, quantity: 5, taux_usd: 100 },
        { item_id: 1, quantity: 2, taux_usd: 50 },
      ]),
      '',
      NO_CUSTOMS,
    );
    expect(items).toHaveLength(1);
    expect(header.subTotal).toBe('100.00');
  });
});

describe('mixed quotation', () => {
  it('sums separate USD and CDF totals across line types', () => {
    const { header, items } = buildQuotation(
      {
        ...base([
          // Customs line in CDF
          { item_id: 1, category_id: 7, rate_cdf: 2000 },
          // Non-customs USD line
          {
            item_id: 2,
            category_id: 8,
            quantity: 1,
            taux_usd: 100,
            has_tva: true,
          },
        ]),
        arsp: 'Enabled',
      },
      'Import Definitive',
      WITH_CUSTOMS(7),
    );
    expect(items).toHaveLength(2);
    expect(items[0].rateCdf).toBe('2000.00');
    expect(items[1].tauxUsd).toBe('100.00');
    expect(header.subTotalCdf).toBe('2000.00');
    expect(header.vatAmountCdf).toBe('320.00'); // 2000 × 0.16
    expect(header.totalAmountCdf).toBe('2320.00');
    expect(header.subTotal).toBe('100.00');
    expect(header.vatAmount).toBe('16.00');
    expect(header.arspAmount).toBe('1.20'); // 100 × 0.012
    expect(header.totalAmount).toBe('117.20');
  });
});

describe('header passthrough', () => {
  it('echoes client_id / quotation_ref / quotation_date', () => {
    const { header } = buildQuotation(
      {
        client_id: 42,
        quotation_ref: 'Q-2026-001',
        quotation_date: '2026-06-20',
        items: [],
      },
      '',
      NO_CUSTOMS,
    );
    expect(header.clientId).toBe(42);
    expect(header.quotationRef).toBe('Q-2026-001');
    expect(header.quotationDate).toBe('2026-06-20');
  });

  it('passes optional master FKs through (kind / transport / goods)', () => {
    const { header } = buildQuotation(
      {
        client_id: 1,
        quotation_ref: 'Q-1',
        kind_id: 3,
        transport_mode_id: 5,
        goods_type_id: 8,
        items: [],
      },
      '',
      NO_CUSTOMS,
    );
    expect(header.kindId).toBe(3);
    expect(header.transportModeId).toBe(5);
    expect(header.goodsTypeId).toBe(8);
  });

  it('nulls optional FKs when omitted', () => {
    const { header } = buildQuotation(base([]), '', NO_CUSTOMS);
    expect(header.kindId).toBeNull();
    expect(header.transportModeId).toBeNull();
    expect(header.goodsTypeId).toBeNull();
    expect(header.quotationDate).toBeNull();
  });
});

describe('Zod body schema (quotationBodySchema)', () => {
  it('accepts a minimal valid body', () => {
    const parsed = quotationBodySchema.parse({
      client_id: 1,
      quotation_ref: 'Q-1',
      items: [],
    });
    expect(parsed.client_id).toBe(1);
  });

  it('coerces numeric strings', () => {
    const parsed = quotationBodySchema.parse({
      client_id: '5',
      quotation_ref: 'Q-1',
      items: [],
    });
    expect(parsed.client_id).toBe(5);
  });

  it('rejects invalid quotation_date format', () => {
    expect(() =>
      quotationBodySchema.parse({
        client_id: 1,
        quotation_ref: 'Q-1',
        quotation_date: '06/20/2026',
        items: [],
      }),
    ).toThrow();
  });

  it('rejects arsp values outside the enum', () => {
    expect(() =>
      quotationBodySchema.parse({
        client_id: 1,
        quotation_ref: 'Q-1',
        arsp: 'On',
        items: [],
      }),
    ).toThrow();
  });

  it('accepts items with coerced numeric fields', () => {
    const parsed = quotationBodySchema.parse({
      client_id: 1,
      quotation_ref: 'Q-1',
      items: [{ item_id: '2', quantity: '3.5', taux_usd: '25.00' }],
    });
    expect(parsed.items[0]).toMatchObject({
      item_id: 2,
      quantity: 3.5,
      taux_usd: 25,
    });
  });
});
