// Furkan Kaan Ünal — 2024502225
import type { Context } from "hono";
import type { Env } from "./auth.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
export type Issue = { path: (string | number)[]; message: string };
export function fail<S extends ContentfulStatusCode>(c: Context<Env>, status: S, error: string, issues: Issue[] = []) {
  return c.json({ error, issues, requestId: c.get("requestId") }, status);
}
