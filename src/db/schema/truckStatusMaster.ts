import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { usersT } from './users';

// Operational truck status catalogue ("At Loading", "En Route to
// Border", "Crossed", "Delivered", …). Prereq for `exports_t.truck_status`
// — distinct from `imports_t.truck_status` which stays a plain varchar
// because imports use a different operational pipeline.

export const truckStatusMaster = pgTable('truck_status_master_t', {
  id: serial('id').primaryKey(),
  truckStatus: varchar('truck_status', { length: 300 }).notNull(),
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

export type TruckStatusMasterRow = typeof truckStatusMaster.$inferSelect;
export type TruckStatusMasterInsert = typeof truckStatusMaster.$inferInsert;
