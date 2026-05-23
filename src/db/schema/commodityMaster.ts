import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const commodityMaster = pgTable('commodity_master_t', {
  id: serial('id').primaryKey(),
  commodityName: varchar('commodity_name', { length: 255 }).notNull(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by').references(() => usersT.id),
  updatedBy: integer('updated_by').references(() => usersT.id),
  createdAt: timestamp('created_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }),
});

export type CommodityMasterRow = typeof commodityMaster.$inferSelect;
export type CommodityMasterInsert = typeof commodityMaster.$inferInsert;
