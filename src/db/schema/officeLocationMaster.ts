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
import { provinceMaster } from './provinceMaster';

// Office location — the client's issuing / branch-reporting office,
// nested under a province. Referenced by client_master_t.office_location_id.
//
// Adapted from main-branch `office_location_master_t`. Distinct from
// `main_office_master_t` (seal-batch owning office) and
// `sub_office_master_t` (customs declaration desk).

export const officeLocationMaster = pgTable(
  'office_location_master_t',
  {
    id: serial('id').primaryKey(),
    locationName: varchar('location_name', { length: 255 }).notNull(),
    provinceId: integer('province_id').references(() => provinceMaster.id, {
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
    provinceIdx: index('idx_office_location_master_t_province').on(t.provinceId),
  }),
);

export const officeLocationMasterRelations = relations(
  officeLocationMaster,
  ({ one }) => ({
    province: one(provinceMaster, {
      fields: [officeLocationMaster.provinceId],
      references: [provinceMaster.id],
    }),
  }),
);

export type OfficeLocationMasterRow = typeof officeLocationMaster.$inferSelect;
export type OfficeLocationMasterInsert =
  typeof officeLocationMaster.$inferInsert;
