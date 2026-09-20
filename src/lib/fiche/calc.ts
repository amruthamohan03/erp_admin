// §2 step 3 / §4.2 — the Fiche de Calcul arithmetic, from configured formulas.
//
// Every figure the fiche computes is a row in tax_rule_master_t, evaluated with
// the pure JSON Logic evaluator. The grid runs this to preview; the save route
// runs it again, with the rows it loads itself, and stores what IT computes — so
// the screen and the record cannot disagree, and a changed rate is a row edit
// under Masters → Tax Rules, not a deploy.
//
// Pure (no DB): safe for a client component.
import { applyRule } from '@/engine/rules/apply';
import type { FicheItem } from '@/db/schema/fiche';

/** The tax_rule_master_t keys the fiche reads. Seeded by migration 0107. */
export const FICHE_RULE_KEYS = {
  /** entity: fob, fret, insurance, autres_charges, usd_rate, is_usd → CIF. */
  cif: 'fiche.cif',
  /** entity: fob, cif → coefficient. */
  coefficient: 'fiche.coefficient',
  /** entity: fob_article, coef → CIF par article. */
  itemCif: 'fiche.item_cif',
  /** entity: cif_article, tx_de_change, ddi_percent → DDI en FC. */
  itemDdi: 'fiche.item_ddi',
} as const;

export type FicheRuleName = keyof typeof FICHE_RULE_KEYS;
/** The formula (JSON Logic) of each rule, keyed by name. */
export type FicheRules = Record<FicheRuleName, unknown>;

export interface FicheHeaderInput {
  fob: number;
  fret: number;
  insurance: number;
  autres_charges: number;
  /** The fiche currency is USD — the other charges are not converted. */
  is_usd: boolean;
  usd_rate: number;
  tx_de_change: number;
}

export interface FicheTotals {
  colis: number;
  qte: number;
  net: number;
  brut: number;
  fob: number;
  cif: number;
  ddi: number;
}

export interface FicheComputed {
  cif: number;
  coefficient: number;
  items: FicheItem[];
  totals: FicheTotals;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const round = (n: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/** A formula that does not produce a number is a configuration fault — say which. */
export class FicheRuleError extends Error {}

function evaluate(rules: FicheRules, name: FicheRuleName, entity: Record<string, unknown>): number {
  const value = applyRule(rules[name], { entity });
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new FicheRuleError(
      `Tax rule ${FICHE_RULE_KEYS[name]} did not produce a number (got ${JSON.stringify(value)}) — correct it under Masters → Tax Rules.`,
    );
  }
  return value;
}

/** A line as the grid holds it, from whatever was stored or submitted. */
export function normaliseFicheItem(raw: Partial<Record<keyof FicheItem, unknown>>, index: number): FicheItem {
  return {
    description: str(raw.description),
    no_bivac: str(raw.no_bivac),
    no_facture: str(raw.no_facture),
    numero: index + 1,
    position_tarif: str(raw.position_tarif),
    ddi_percent: num(raw.ddi_percent),
    description_tarif: str(raw.description_tarif),
    av: str(raw.av),
    org: str(raw.org),
    prov: str(raw.prov),
    regime: str(raw.regime),
    code_add: str(raw.code_add),
    colis: num(raw.colis),
    qte: num(raw.qte),
    net: num(raw.net),
    brut: num(raw.brut),
    fob_article: num(raw.fob_article),
    coef: num(raw.coef),
    cif_article: num(raw.cif_article),
    ddi: num(raw.ddi),
  };
}

export const emptyFicheItem = (index: number): FicheItem => normaliseFicheItem({}, index);

/**
 * CIF and coefficient from the header, then each line's CIF and DDI.
 *
 * Throws FicheRuleError when a formula is misconfigured.
 */
export function computeFiche(header: FicheHeaderInput, items: FicheItem[], rules: FicheRules): FicheComputed {
  const cif = round(
    evaluate(rules, 'cif', {
      fob: header.fob,
      fret: header.fret,
      insurance: header.insurance,
      autres_charges: header.autres_charges,
      usd_rate: header.usd_rate || 1,
      is_usd: header.is_usd,
    }),
    2,
  );
  const coefficient = round(evaluate(rules, 'coefficient', { fob: header.fob, cif }), 6);
  // main treats a blank exchange rate as 1 when previewing a line's DDI.
  const rate = header.tx_de_change || 1;

  const lines = items.map((raw, i) => {
    const it = normaliseFicheItem(raw, i);
    const cifArticle = round(evaluate(rules, 'itemCif', { fob_article: it.fob_article, coef: coefficient }), 2);
    const ddi = round(
      evaluate(rules, 'itemDdi', { cif_article: cifArticle, tx_de_change: rate, ddi_percent: it.ddi_percent }),
      2,
    );
    return { ...it, coef: coefficient, cif_article: cifArticle, ddi };
  });

  const sum = (k: keyof FicheTotals & keyof FicheItem): number => round(lines.reduce((s, l) => s + num(l[k]), 0), 2);
  return {
    cif,
    coefficient,
    items: lines,
    totals: {
      colis: sum('colis'),
      qte: sum('qte'),
      net: sum('net'),
      brut: sum('brut'),
      fob: round(lines.reduce((s, l) => s + l.fob_article, 0), 2),
      cif: round(lines.reduce((s, l) => s + l.cif_article, 0), 2),
      ddi: sum('ddi'),
    },
  };
}

/**
 * The seeded formulas — main's arithmetic, as JSON Logic. Migration 0107 writes
 * these to tax_rule_master_t; they are here too so the tests pin the behaviour
 * the seed ships with.
 *
 *   CIF   = FOB + (fret + insurance + other) × (1 if USD, else the USD rate)
 *   coef  = CIF ÷ FOB, or 1 without a FOB
 *   CIF/l = FOB/l × coef
 *   DDI/l = ⌊CIF/l × exchange rate × DDI% ÷ 100⌋   (floor as x − x mod 1)
 */
const ddiRaw = {
  '/': [{ '*': [{ var: 'entity.cif_article' }, { var: 'entity.tx_de_change' }, { var: 'entity.ddi_percent' }] }, 100],
};
export const FICHE_DEFAULT_FORMULAS: FicheRules = {
  cif: {
    '+': [
      { var: 'entity.fob' },
      {
        '*': [
          { '+': [{ var: 'entity.fret' }, { var: 'entity.insurance' }, { var: 'entity.autres_charges' }] },
          { if: [{ var: 'entity.is_usd' }, 1, { var: 'entity.usd_rate' }] },
        ],
      },
    ],
  },
  coefficient: { if: [{ '>': [{ var: 'entity.fob' }, 0] }, { '/': [{ var: 'entity.cif' }, { var: 'entity.fob' }] }, 1] },
  itemCif: { '*': [{ var: 'entity.fob_article' }, { var: 'entity.coef' }] },
  itemDdi: { '-': [ddiRaw, { '%': [ddiRaw, 1] }] },
};
