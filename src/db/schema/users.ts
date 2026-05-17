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
  locationId: varchar('location_id', { length: 100 }),
  deptId: varchar('dept_id', { length: 100 }),
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
