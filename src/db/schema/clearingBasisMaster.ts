import { pgTable, serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { usersT } from './users';

// What an import consignment is cleared on the basis of. Ships with no rows —
// the values are operational and belong to the operator, not to this repo.

export const clearingBasisMaster = pgTable('clearing_basis_master_t', {
  id: serial('id').primaryKey(),
  clearingBasisName: varchar('clearing_basis_name', { length: 200 }).notNull(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
  updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export type ClearingBasisMasterRow = typeof clearingBasisMaster.$inferSelect;
export type ClearingBasisMasterInsert = typeof clearingBasisMaster.$inferInsert;
