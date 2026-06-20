import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Unit of measure master — kg, m³, box, container, etc. Used by
// quotation line items to specify the unit a quantity is in. unit_code is
// a short symbol (kg, m3, box) that's shown beside the quantity in compact
// table cells; unit_name is the human-readable label.

export const unitMaster = pgTable('unit_master_t', {
  id: serial('id').primaryKey(),
  unitName: varchar('unit_name', { length: 100 }).notNull(),
  unitCode: varchar('unit_code', { length: 20 }),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id, {
    onDelete: 'set null',
  }),
  updatedBy: integer('updated_by').references(() => usersT.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
});

export type UnitMasterRow = typeof unitMaster.$inferSelect;
export type UnitMasterInsert = typeof unitMaster.$inferInsert;
