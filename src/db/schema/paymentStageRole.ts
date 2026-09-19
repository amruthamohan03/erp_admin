// §4.6 — config-driven approval matrix for the Payment Request workflow. Maps
// each approval STAGE to the role(s) allowed to act on it, replacing main's
// hardcoded role-id checks (forbidden by §4.7). A business analyst changes who
// approves what under Mapping → Role Payment Stage Mapping — no code change.
//
// `location_id` scopes a grant to one office (main's location-bound roles:
// Kolwezi's department head approves Kolwezi's requests only). NULL means every
// location. One grant per (stage, role, location scope) — the unique index
// treats NULL as its own scope via COALESCE, since Postgres would otherwise let
// any number of NULL-location duplicates in.
import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usersT } from './users';
import { roleMaster } from './roles';
import { mainOfficeMaster } from './mainOfficeMaster';


export const paymentStageRole = pgTable(
  'payment_stage_role_master_t',
  {
    id: serial('id').primaryKey(),
    stage: varchar('stage', { length: 20 }).notNull(),
    roleId: integer('role_id').references(() => roleMaster.id).notNull(),
    locationId: integer('location_id').references(() => mainOfficeMaster.id, { onDelete: 'cascade' }),
    display: varchar('display', { length: 1 }).notNull().default('Y'),
    createdBy: integer('created_by').references(() => usersT.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => usersT.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
  },
  (t) => ({
    stageRoleLocUq: uniqueIndex('uq_payment_stage_role_loc').on(
      t.stage,
      t.roleId,
      sql`COALESCE(${t.locationId}, 0)`,
    ),
  }),
);

export type PaymentStageRoleRow = typeof paymentStageRole.$inferSelect;
export type PaymentStageRoleInsert = typeof paymentStageRole.$inferInsert;
