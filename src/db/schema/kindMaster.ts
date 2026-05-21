import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';

export const kindMaster = pgTable('kind_master_t', {
  id: serial('id').primaryKey(),
  kindName: varchar('kind_name', { length: 100 }).notNull(),
  kindShortName: varchar('kind_short_name', { length: 20 }).notNull(),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by'),
  updatedBy: integer('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .defaultNow()
    .notNull(),
});

export type KindMasterRow = typeof kindMaster.$inferSelect;
export type KindMasterInsert = typeof kindMaster.$inferInsert;
