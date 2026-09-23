import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { roleMaster } from './roles';
import { mainOfficeMaster } from './mainOfficeMaster';
import { departmentMaster } from './departmentMaster';

export const usersT = pgTable('users_t', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 255 }).notNull().unique(),
  password: text('password').notNull(),
  email: varchar('email', { length: 100 }).notNull().unique(),
  mobile: varchar('mobile', { length: 15 }),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  roleId: integer('role_id')
    .notNull()
    .references(() => roleMaster.id),
  /**
   * §4.1 — master ids, not typed text (migration 0076).
   *
   * The FKs are real in the database (`users_t_location_id_fkey` →
   * `main_office_master_t`, `users_t_dept_id_fkey` → `department_master_t`,
   * both ON DELETE SET NULL, because an account outlives the posting it was
   * created under). They are deliberately NOT declared with `.references()`
   * here: both master tables already point back at `users_t` through
   * created_by/updated_by, and closing that loop in the type graph makes
   * TypeScript give up and infer `any` for all three tables (TS7022).
   */
  locationId: integer('location_id'),
  deptId: integer('dept_id'),
  /**
   * The client this account belongs to, or NULL for a member of staff.
   *
   * This is the ONE fact that scopes a login to one client's data: set it, and
   * every list, detail, dashboard and export the user can reach is narrowed to
   * that client's rows. NULL means unscoped, which is what every existing
   * account is and stays.
   *
   * Deliberately a column rather than a role flag, because §4.7 forbids
   * deciding anything by role NAME and a role is shared by many people — two
   * clients could not both use a "Client" role without a second mapping anyway.
   * Which menus a client login can reach is still the role's job
   * (`role_menu_mapping_t`); this only decides which ROWS it sees inside them.
   *
   * Not declared with `.references()` for the same reason as location/dept
   * above — `client_master_t` points back at `users_t` through
   * created_by/updated_by, and closing that loop makes TypeScript infer `any`
   * for every table in the cycle (TS7022). The FK is real in the database.
   */
  clientId: integer('client_id'),
  profileImage: varchar('profile_image', { length: 255 }).default('default.jpg'),
  signatureImage: varchar('signature_image', { length: 255 }),
  bio: text('bio'),
  themePreference: varchar('theme_preference', { length: 20 }),
  // Vestigial. The machine-translation layer this fed was removed; nothing reads
  // or writes it any more. The column is kept rather than dropped because losing
  // a column is irreversible and this one costs nothing — drop it in its own
  // migration once you are sure no report or export still selects it (§7.2).
  localePreference: varchar('locale_preference', { length: 10 }),
  emailNotifications: varchar('email_notifications', { length: 1 }).default('Y'),
  compactMode: varchar('compact_mode', { length: 1 }).default('N'),
  display: varchar('display', { length: 1 }).notNull().default('Y'),
  createdBy: integer('created_by'),
  updatedBy: integer('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).defaultNow().notNull(),
});

export const usersTRelations = relations(usersT, ({ one }) => ({
  role: one(roleMaster, {
    fields: [usersT.roleId],
    references: [roleMaster.id],
  }),
}));

export type UserRow = typeof usersT.$inferSelect;
export type UserInsert = typeof usersT.$inferInsert;
