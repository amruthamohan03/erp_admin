import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

export const truckStatusMaster = pgTable('truck_status_master_t', {
  id: serial('id').primaryKey(),
  truckStatus: varchar('truck_status', { length: 300 }).notNull(),
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

export type TruckStatusMasterRow = typeof truckStatusMaster.$inferSelect;
export type TruckStatusMasterInsert = typeof truckStatusMaster.$inferInsert;
