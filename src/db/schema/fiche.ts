import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  date,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usersT } from './users';
import { licenseT } from './license';
import { importT } from './imports';
import { regimeMaster } from './regimeMaster';
import { currencyMaster } from './currencyMaster';
import { transportModeMaster } from './transportModeMaster';
import { incotermMaster } from './incotermMaster';

// §2 step 3 — Fiche de Calcul: the duty calculation raised on ONE import file
// (licence → MCA reference) during tracking. Ported from main's
// fiche_de_calculs + fiche_items.
//
// The header copies the file's values (regime, currency, transport, weight,
// FOB / fret / insurance / other charges with their currencies) so the fiche
// records what it was calculated FROM even if the file is edited later.
//
// CIF, the coefficient, and each line's CIF and DDI are COMPUTED — by the
// formulas in tax_rule_master_t (`fiche.*`), through src/lib/fiche/calc.ts on
// both the screen and the save route. A submitted figure is never trusted.
//
// `state` is the workflow state (workflow_master_t 'fiche_de_calcul':
// created → verified → audited), never a hardcoded status list (§4.6).
//
// The lines are a JSONB column, not a child table (§4.5): they are read with
// the fiche and saved by its one Save, never reported on across fiches.

/** One line of a fiche — main's fiche_items row. */
export interface FicheItem {
  description: string;
  no_bivac: string;
  /** The file's commercial invoice number (imports_t.invoice). */
  no_facture: string;
  numero: number;
  /** HS code (Position Tarifaire). */
  position_tarif: string;
  ddi_percent: number;
  description_tarif: string;
  av: string;
  org: string;
  prov: string;
  regime: string;
  code_add: string;
  colis: number;
  qte: number;
  net: number;
  brut: number;
  fob_article: number;
  /** Computed: the header coefficient. */
  coef: number;
  /** Computed: FOB × coefficient. */
  cif_article: number;
  /** Computed: DDI in CDF. */
  ddi: number;
}

export const ficheDeCalcul = pgTable(
  'fiche_de_calcul_t',
  {
    id: serial('id').primaryKey(),
    licenseId: integer('license_id').references(() => licenseT.id),
    importId: integer('import_id').references(() => importT.id),
    ficheReference: varchar('fiche_reference', { length: 150 }),
    ficheDate: date('fiche_date'),
    regimeId: integer('regime_id').references(() => regimeMaster.id),
    currencyId: integer('currency_id').references(() => currencyMaster.id),
    transportModeId: integer('transport_mode_id').references(() => transportModeMaster.id),
    poids: numeric('poids', { precision: 15, scale: 2 }),
    txDeChange: numeric('tx_de_change', { precision: 18, scale: 6 }),
    fob: numeric('fob', { precision: 15, scale: 2 }),
    fobCurrencyId: integer('fob_currency_id').references(() => currencyMaster.id),
    insuranceAmount: numeric('insurance_amount', { precision: 15, scale: 2 }),
    insuranceCurrencyId: integer('insurance_currency_id').references(() => currencyMaster.id),
    fret: numeric('fret', { precision: 15, scale: 2 }),
    fretCurrencyId: integer('fret_currency_id').references(() => currencyMaster.id),
    autresCharges: numeric('autres_charges', { precision: 15, scale: 2 }),
    autresChargesCurrencyId: integer('autres_charges_currency_id').references(() => currencyMaster.id),
    usdToCurrencyRate: numeric('usd_to_currency_rate', { precision: 18, scale: 6 }).default('1'),
    provence: varchar('provence', { length: 100 }),
    incotermId: integer('incoterm_id').references(() => incotermMaster.id),
    cif: numeric('cif', { precision: 18, scale: 2 }),
    coefficient: numeric('coefficient', { precision: 18, scale: 6 }),
    items: jsonb('items').$type<FicheItem[]>().default([]),
    state: varchar('state', { length: 100 }),
    verifiedBy: integer('verified_by').references(() => usersT.id, { onDelete: 'set null' }),
    verifiedAt: timestamp('verified_at', { withTimezone: false }),
    auditedBy: integer('audited_by').references(() => usersT.id, { onDelete: 'set null' }),
    auditedAt: timestamp('audited_at', { withTimezone: false }),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    // One live fiche per import file — main's "already used for creating a fiche".
    importUq: uniqueIndex('uq_fiche_de_calcul_t_import').on(t.importId).where(sql`${t.display} = 'Y'`),
    referenceUq: uniqueIndex('uq_fiche_de_calcul_t_reference')
      .on(t.ficheReference)
      .where(sql`${t.display} = 'Y'`),
    licenseIdx: index('idx_fiche_de_calcul_t_license').on(t.licenseId),
    stateIdx: index('idx_fiche_de_calcul_t_state').on(t.state),
  }),
);

export type FicheDeCalculRow = typeof ficheDeCalcul.$inferSelect;
export type FicheDeCalculInsert = typeof ficheDeCalcul.$inferInsert;
