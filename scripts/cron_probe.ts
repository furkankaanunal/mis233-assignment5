// Furkan Kaan Ünal — 2024502225
// A real once-a-minute scheduler probe; the production schedule stays 03:00 UTC.
import { createDb, migrate } from "../src/db.ts";
import { tasks, users } from "../src/schema.ts";
import { purgeOldDone } from "../src/jobs.ts";
const dir = await Deno.makeTempDir();
const database = createDb(`file:${dir}/cron.db`, 1);
await migrate(database);
const [user] = await database.db.insert(users).values({
  email: "cron@example.com",
  passwordHash: "probe-only",
}).returning();
await database.db.insert(tasks).values({
  userId: user.id,
  title: "Old completed task",
  status: "done",
  completedAt: Math.floor(Date.now() / 1000) - 31 * 86400,
});
console.log(
  JSON.stringify({
    probe: "cron",
    schedule: "* * * * *",
    waitingSince: new Date().toISOString(),
  }),
);
Deno.cron("purge evidence probe", "* * * * *", async () => {
  const removed = await purgeOldDone(database, 30);
  const secondRun = await purgeOldDone(database, 30);
  console.log(
    JSON.stringify({
      job: "purge",
      removed,
      secondRun,
      firedAt: new Date().toISOString(),
    }),
  );
  database.close();
  await Deno.remove(dir, { recursive: true });
  Deno.exit(0);
});
setTimeout(() => {
  console.error("Cron did not fire within 70 seconds");
  Deno.exit(1);
}, 70_000);
