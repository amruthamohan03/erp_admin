import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const typeOfGoodsMaster = pgTable('type_of_goods_master_t', {
  id: serial('id').primaryKey(),
  goodsType: varchar('goods_type', { length: 100 }).notNull(),
  goodsShortName: varchar('goods_short_name', { length: 20 }).notNull(),
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

export type TypeOfGoodsMasterRow = typeof typeOfGoodsMaster.$inferSelect;
export type TypeOfGoodsMasterInsert = typeof typeOfGoodsMaster.$inferInsert;
