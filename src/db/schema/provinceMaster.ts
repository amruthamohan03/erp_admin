import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { usersT } from './users';
import { originMaster } from './originMaster';

// Province / sub-national region catalogue. FK to `origin_master_t`
// — provinces nest under an origin (country). Used by client
// onboarding and any address-bearing record.

export const provinceMaster = pgTable(
  'province_master_t',
  {
    id: serial('id').primaryKey(),
    provinceName: varchar('province_name', { length: 255 }).notNull(),
    originId: integer('origin_id').references(() => originMaster.id, {
      onDelete: 'set null',
    }),
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
  },
  (t) => ({
    originIdx: index('idx_province_master_t_origin').on(t.originId),
  }),
);

export const provinceMasterRelations = relations(provinceMaster, ({ one }) => ({
  origin: one(originMaster, {
    fields: [provinceMaster.originId],
    references: [originMaster.id],
  }),
}));

export type ProvinceMasterRow = typeof provinceMaster.$inferSelect;
export type ProvinceMasterInsert = typeof provinceMaster.$inferInsert;
