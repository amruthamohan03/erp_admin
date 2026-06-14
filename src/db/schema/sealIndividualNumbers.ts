// Individual seal numbers (seal_individual_numbers_t). One row per physical seal,
// tracked through Available → Used / Damaged. seal_number is globally unique.
import {
  pgTable, serial, integer, varchar, text, timestamp, index, uniqueIndex, type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import { sealNos } from './sealNos';

export const sealIndividualNumbers = pgTable(
  'seal_individual_numbers_t',
  {
    id: serial('id').primaryKey(),
    sealMasterId: integer('seal_master_id').notNull().references((): AnyPgColumn => sealNos.id),
    sealNumber: varchar('seal_number', { length: 100 }).notNull(),
    // Available | Used | Damaged
    status: varchar('status', { length: 20 }).notNull().default('Available'),
    notes: text('notes'),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references((): AnyPgColumn => usersT.id),
    updatedBy: integer('updated_by').references((): AnyPgColumn => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    sealNumberUq: uniqueIndex('uq_seal_individual_numbers_t_number').on(t.sealNumber),
    masterIdx: index('idx_seal_individual_numbers_t_master').on(t.sealMasterId),
    statusIdx: index('idx_seal_individual_numbers_t_status').on(t.status),
  }),
);

export type SealIndividualNumberRow = typeof sealIndividualNumbers.$inferSelect;
export type SealIndividualNumberInsert = typeof sealIndividualNumbers.$inferInsert;
