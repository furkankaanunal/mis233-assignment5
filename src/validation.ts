// Furkan Kaan Ünal — 2024502225
import { z } from "@hono/zod-openapi";
const Password = z.string().max(72).refine(
  (value) => new TextEncoder().encode(value).length <= 72,
  "password must be at most 72 UTF-8 bytes",
);
export const Credentials = z.object({
  email: z.email().trim().toLowerCase(),
  password: Password.min(8),
}).strict().openapi("Credentials");
export const LoginCredentials = Credentials.extend({
  password: Password.min(1),
}).openapi("LoginCredentials");
export const TaskBody = z.object({
  title: z.string().trim().min(1).max(100),
  status: z.enum(["todo", "in-progress", "done"]).default("todo"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueDate: z.iso.date().nullable().default(null),
}).strict().openapi("TaskInput");
const positive = z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(
  z.number().int().max(Number.MAX_SAFE_INTEGER),
);
export const Id = z.object({ id: positive });
export const PageQuery = z.object({
  page: positive.pipe(z.number().max(1_000_000)).default(1),
  limit: positive.pipe(z.number().max(100)).default(20),
  status: z.enum(["todo", "in-progress", "done"]).optional(),
}).strict();
export const EmptyQuery = z.object({}).strict();
export const TaskSchema = z.object({
  id: z.number(),
  userId: z.number(),
  title: z.string(),
  status: z.enum(["todo", "in-progress", "done"]),
  priority: z.enum(["low", "medium", "high"]),
  createdAt: z.number(),
  updatedAt: z.number(),
  completedAt: z.number().nullable(),
  deletedAt: z.number().nullable(),
  attachment: z.string().nullable(),
  dueDate: z.string().nullable(),
}).openapi("Task");
export const ErrorSchema = z.object({
  error: z.string(),
  issues: z.array(
    z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() }),
  ),
  requestId: z.string(),
}).openapi("ApiError");
export const UserSchema = z.object({ id: z.number(), email: z.string() });
export const Ok = z.object({ ok: z.literal(true) });
export const json = <S extends z.ZodType>(schema: S, description = "Success") => ({
  description,
  content: { "application/json": { schema } },
});
export const errors = {
  400: json(ErrorSchema, "Invalid input"),
  401: json(ErrorSchema, "Unauthorized"),
  404: json(ErrorSchema, "Not found"),
  500: json(ErrorSchema, "Internal error"),
};
