// Furkan Kaan Ünal — 2024502225
import { z } from "zod";
const ConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.string().regex(/^(file:|libsql:\/\/|https:\/\/)/),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  JWT_SECRET: z.string().min(8),
  APP_ENV: z.enum(["development", "test", "production"]),
  UPLOAD_DIR: z.string().min(1).default("./uploads"),
  POOL_SIZE: z.coerce.number().int().min(1).max(10).default(3),
}).superRefine((v, ctx) => {
  if (
    v.APP_ENV === "production" &&
    (v.JWT_SECRET === "dev-secret" || v.JWT_SECRET.length < 32 ||
      v.JWT_SECRET.includes("REPLACE"))
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["JWT_SECRET"],
      message: "production needs a private secret of at least 32 characters",
    });
  }
  if (
    v.APP_ENV === "production" && !v.DATABASE_URL.startsWith("file:") &&
    !v.DATABASE_AUTH_TOKEN
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["DATABASE_AUTH_TOKEN"],
      message: "remote production database token required",
    });
  }
});
export type Config = z.infer<typeof ConfigSchema>;
export function parseConfig(env: Record<string, string | undefined>): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid configuration: ${parsed.error.message}`);
  return parsed.data;
}
export const loadConfig = () => parseConfig(Deno.env.toObject());
