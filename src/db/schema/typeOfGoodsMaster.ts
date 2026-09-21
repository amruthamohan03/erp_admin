import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Goods type — broad commodity classification (e.g. "General Merchandise",
// "Vehicles", "Hazardous"). Distinct from HS code; this is the operator-
// facing bucket for filtering and reporting. `goods_short_name` is a short
// label for compact UI surfaces.

export const typeOfGoodsMaster = pgTable('type_of_goods_master_t', {
  id: serial('id').primaryKey(),
  goodsType: varchar('goods_type', { length: 100 }).notNull(),
  goodsShortName: varchar('goods_short_name', { length: 20 }).notNull(),
  // Whether weight limits apply to licences and files of this type (0112).
  // Off for DIVERS, whose licence may carry no weight at all: its files may
  // total more than the licence weight and weigh more than their inspection
  // report. Read by the weight guards in db/queries/partielle.ts.
  weightLimited: boolean('weight_limited').notNull().default(true),
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

export type TypeOfGoodsMasterRow = typeof typeOfGoodsMaster.$inferSelect;
export type TypeOfGoodsMasterInsert = typeof typeOfGoodsMaster.$inferInsert;
