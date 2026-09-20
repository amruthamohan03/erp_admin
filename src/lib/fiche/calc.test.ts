import { describe, it, expect } from 'vitest';
import { computeFiche, emptyFicheItem, FICHE_DEFAULT_FORMULAS, FicheRuleError } from './calc';

const header = { fob: 1000, fret: 100, insurance: 50, autres_charges: 50, is_usd: true, usd_rate: 1, tx_de_change: 2800 };
const line = (over: Partial<ReturnType<typeof emptyFicheItem>> = {}) => ({ ...emptyFicheItem(0), ...over });

describe('computeFiche — the seeded formulas reproduce main', () => {
  it('CIF adds the charges to FOB, and the coefficient is CIF ÷ FOB', () => {
    const r = computeFiche(header, [], FICHE_DEFAULT_FORMULAS);
    expect(r.cif).toBe(1200);
    expect(r.coefficient).toBe(1.2);
  });

  it('converts the charges at the USD rate when the fiche is not in USD', () => {
    const r = computeFiche({ ...header, is_usd: false, usd_rate: 2 }, [], FICHE_DEFAULT_FORMULAS);
    expect(r.cif).toBe(1400);
  });

  it('a fiche with no FOB has a coefficient of 1', () => {
    expect(computeFiche({ ...header, fob: 0 }, [], FICHE_DEFAULT_FORMULAS).coefficient).toBe(1);
  });

  it('a line is FOB × coefficient, and its DDI is floored', () => {
    const r = computeFiche({ ...header, tx_de_change: 2801 }, [line({ fob_article: 101, ddi_percent: 7.5 })], FICHE_DEFAULT_FORMULAS);
    expect(r.items[0]?.cif_article).toBe(121.2);
    // 121.2 × 2801 × 0.075 = 25 461.09 → 25 461
    expect(r.items[0]?.ddi).toBe(25461);
    expect(r.items[0]?.coef).toBe(1.2);
  });

  it('numbers lines in order and totals them', () => {
    const r = computeFiche(header, [line({ fob_article: 100, colis: 2 }), line({ fob_article: 50, colis: 3 })], FICHE_DEFAULT_FORMULAS);
    expect(r.items.map((i) => i.numero)).toEqual([1, 2]);
    expect(r.totals).toMatchObject({ colis: 5, fob: 150, cif: 180 });
  });

  it('names the rule when a formula is misconfigured', () => {
    expect(() => computeFiche(header, [], { ...FICHE_DEFAULT_FORMULAS, cif: { cat: ['x'] } })).toThrow(FicheRuleError);
    expect(() => computeFiche(header, [], { ...FICHE_DEFAULT_FORMULAS, cif: { cat: ['x'] } })).toThrow(/fiche\.cif/);
  });
});
