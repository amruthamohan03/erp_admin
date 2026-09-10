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
  profileImage: varchar('profile_image', { length: 255 }).default('default.jpg'),
  signatureImage: varchar('signature_image', { length: 255 }),
  bio: text('bio'),
  themePreference: varchar('theme_preference', { length: 20 }),
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
