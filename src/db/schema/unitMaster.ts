import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const unitMaster = pgTable('unit_master_t', {
  id: serial('id').primaryKey(),
  unitName: varchar('unit_name', { length: 100 }).notNull(),
  unitCode: varchar('unit_code', { length: 20 }),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id),
  updatedBy: integer('updated_by').references(() => usersT.id),
  createdAt: timestamp('created_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
});

export type UnitMasterRow = typeof unitMaster.$inferSelect;
export type UnitMasterInsert = typeof unitMaster.$inferInsert;
