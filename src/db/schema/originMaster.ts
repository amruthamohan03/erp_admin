import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Country-of-origin catalogue ("DRC", "Zambia", "South Africa", …).
// Parent FK for `province_master_t` — every province lives in an
// origin. Used by future shipping-origin / certificate-of-origin flows.

export const originMaster = pgTable('origin_master_t', {
  id: serial('id').primaryKey(),
  originName: varchar('origin_name', { length: 255 }).notNull(),
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

export type OriginMasterRow = typeof originMaster.$inferSelect;
export type OriginMasterInsert = typeof originMaster.$inferInsert;
