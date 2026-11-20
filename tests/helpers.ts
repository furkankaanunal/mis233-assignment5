// Furkan Kaan Ünal — 2024502225
import { createApp } from "../src/app.ts";
import { createDb, migrate } from "../src/db.ts";
import { parseConfig } from "../src/config.ts";
import { assertEquals } from "@std/assert";
export async function freshApp(now?: () => number) {
  const dir = await Deno.makeTempDir();
  const database = createDb(`file:${dir}/tasks.db`);
  await migrate(database);
  const kv = await Deno.openKv(":memory:");
  const logs: string[] = [];
  const config = parseConfig({
    PORT: "8001",
    DATABASE_URL: `file:${dir}/tasks.db`,
    JWT_SECRET: "test-secret",
    APP_ENV: "test",
    UPLOAD_DIR: `${dir}/uploads`,
  });
  const app = createApp(database, { config, kv, log: (s) => logs.push(s), now });
  return {
    app,
    database,
    kv,
    config,
    logs,
    async close() {
      app.live.close();
      kv.close();
      database.close();
      await Deno.remove(dir, { recursive: true });
    },
  };
}
export type Fixture = Awaited<ReturnType<typeof freshApp>>;
export async function fixture(fn: (f: Fixture) => Promise<void>, now?: () => number) {
  const f = await freshApp(now);
  try {
    await fn(f);
  } finally {
    await f.close();
  }
}
export function request(
  f: Fixture,
  path: string,
  method = "GET",
  value?: unknown,
  token?: string,
) {
  return f.app.request(path, {
    method,
    headers: {
      ...(value !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
}
export async function account(f: Fixture, email = "student@example.com") {
  assertEquals(
    (await request(f, "/auth/register", "POST", { email, password: "study1234" })).status,
    201,
  );
  const response = await request(f, "/auth/login", "POST", {
    email,
    password: "study1234",
  });
  assertEquals(response.status, 200);
  return (await response.json()).token as string;
}
export async function add(
  f: Fixture,
  token: string,
  title = "Review MIS 233",
  status = "todo",
) {
  const response = await request(f, "/api/tasks", "POST", { title, status }, token);
  assertEquals(response.status, 201);
  return await response.json() as { id: number; title: string };
}
