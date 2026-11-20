// Furkan Kaan Ünal — 2024502225
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import type { MiddlewareHandler } from "hono";
import type { Connection } from "./db.ts";
import type { Role } from "./schema.ts";
import { fail } from "./errors.ts";
export type Identity = { userId: number; role: Role };
export type Env = { Variables: Identity & { requestId: string; connection: Connection } };
export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const checkPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
const key = (secret: string) => new TextEncoder().encode(secret);
export function signToken(userId: number, role: Role, secret: string, expiration: string | number = "1h") {
  return new SignJWT({ role }).setProtectedHeader({ alg: "HS256" }).setSubject(String(userId))
    .setIssuer("tasks-api").setAudience("tasks-client").setIssuedAt().setExpirationTime(expiration).sign(key(secret));
}
export async function verifyToken(token: string, secret: string): Promise<Identity | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"], issuer: "tasks-api", audience: "tasks-client" });
    const userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || userId < 1 || !["user", "admin"].includes(String(payload.role))) return null;
    return { userId, role: payload.role as Role };
  } catch { return null; }
}
export const requireAuth = (secret: string): MiddlewareHandler<Env> => async (c, next) => {
  const match = /^Bearer ([^ ]+)$/.exec(c.req.header("authorization") ?? "");
  const identity = match ? await verifyToken(match[1], secret) : null;
  if (!identity) return fail(c, 401, "unauthorized");
  c.set("userId", identity.userId); c.set("role", identity.role);
  await next();
};
export const requireRole = (...roles: Role[]): MiddlewareHandler<Env> => async (c, next) => {
  if (!c.get("role")) return fail(c, 401, "unauthorized");
  if (!roles.includes(c.get("role"))) return fail(c, 403, "forbidden");
  await next();
};
