// Furkan Kaan Ünal — 2024502225
import { createApp } from "./app.ts";
import { createDb, migrate } from "./db.ts";
import { loadConfig } from "./config.ts";
import { purgeOldDone } from "./jobs.ts";
const config = loadConfig();
const database = createDb(
  config.DATABASE_URL,
  config.POOL_SIZE,
  config.DATABASE_AUTH_TOKEN,
);
await migrate(database);
const kv = await Deno.openKv();
const app = createApp(database, { config, kv });
const stop = new AbortController();
const cron = Deno.cron(
  "purge old done tasks",
  "0 3 * * *",
  { signal: stop.signal },
  async () => {
    const removed = await purgeOldDone(
      database,
      30,
      app.cache,
      app.live,
      config.UPLOAD_DIR,
    );
    console.log(JSON.stringify({ job: "purge", removed }));
  },
);
const server = Deno.serve({ port: config.PORT }, app.fetch);
let closing = false;
Deno.addSignalListener("SIGTERM", async () => {
  if (closing) return;
  closing = true;
  app.live.close();
  stop.abort();
  await cron;
  await server.shutdown();
  kv.close();
  database.close();
});
