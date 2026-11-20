// Furkan Kaan Ünal — 2024502225
import { drizzle } from "drizzle-orm/libsql";
import { migrate as runMigrations } from "drizzle-orm/libsql/migrator";
import { createClient } from "@libsql/client";
import type { Logger } from "drizzle-orm/logger";
import * as schema from "./schema.ts";
import { Pool } from "./pool.ts";
export type Connection = ReturnType<typeof openConnection>;
function openConnection(url: string, authToken?: string, logger?: Logger) {
  const client = createClient({ url, authToken });
  return { client, db: drizzle(client, { schema, logger }) };
}
export function createDb(url: string, size = 3, authToken?: string, logger?: Logger) {
  const connections = Array.from(
    { length: size },
    () => openConnection(url, authToken, logger),
  );
  return {
    ...connections[0],
    connections,
    pool: new Pool(connections),
    close: () => connections.forEach((c) => c.client.close()),
  };
}
export type Db = ReturnType<typeof createDb>;
export async function migrate(database: Db) {
  await runMigrations(database.db, {
    migrationsFolder: new URL("../drizzle", import.meta.url).pathname,
  });
  for (const { client } of database.connections) {
    await client.execute("PRAGMA foreign_keys=ON");
    await client.execute("PRAGMA busy_timeout=5000");
    if (client.protocol === "file") await client.execute("PRAGMA journal_mode=WAL");
  }
}
