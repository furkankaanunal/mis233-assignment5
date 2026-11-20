// Furkan Kaan Ünal — 2024502225
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now'))`),
});
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  status: text("status", { enum: ["todo", "in-progress", "done"] }).notNull().default("todo"),
  priority: text("priority", { enum: ["low", "medium", "high"] }).notNull().default("medium"),
  createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now'))`),
  updatedAt: integer("updated_at").notNull().default(sql`(strftime('%s','now'))`),
  completedAt: integer("completed_at"),
  deletedAt: integer("deleted_at"),
  attachment: text("attachment"),
  dueDate: text("due_date"),
}, (t) => [
  index("idx_tasks_user_status").on(t.userId, t.status),
  check("tasks_status_check", sql`${t.status} in ('todo', 'in-progress', 'done')`),
  check("tasks_priority_check", sql`${t.priority} in ('low', 'medium', 'high')`),
]);
export type Task = typeof tasks.$inferSelect;
export type Role = typeof users.$inferSelect.role;
