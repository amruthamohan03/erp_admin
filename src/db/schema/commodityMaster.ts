import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Specific commodity reference. Finer than typeOfGoodsMaster — that's
// the broad bucket; this is the line-item description ("Used vehicle —
// sedan 2018", "Coffee beans Robusta", etc.) attached to a customs
// declaration.
//
// Fixed from main: updated_at gets defaultNow() + notNull() (main had
// the column without defaults — likely a transcription bug since every
// other master_t table has them).

export const commodityMaster = pgTable('commodity_master_t', {
  id: serial('id').primaryKey(),
  commodityName: varchar('commodity_name', { length: 255 }).notNull(),
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

export type CommodityMasterRow = typeof commodityMaster.$inferSelect;
export type CommodityMasterInsert = typeof commodityMaster.$inferInsert;
