// TODO(config): move to master_* per CLAUDE.md §4.1; keeping `office_location_master_t`
// because the user asked to mirror the source DB naming exactly.
import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';
import { provinceMaster } from './provinceMaster';

export const officeLocationMaster = pgTable(
  'office_location_master_t',
  {
    id: serial('id').primaryKey(),
    locationName: varchar('location_name', { length: 255 }).notNull(),
    provinceId: integer('province_id').references(() => provinceMaster.id),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id),
    updatedBy: integer('updated_by').references(() => usersT.id),
    createdAt: timestamp('created_at', { withTimezone: false })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    provinceIdx: index('idx_office_location_province').on(t.provinceId),
  }),
);

export type OfficeLocationMasterRow = typeof officeLocationMaster.$inferSelect;
export type OfficeLocationMasterInsert = typeof officeLocationMaster.$inferInsert;
