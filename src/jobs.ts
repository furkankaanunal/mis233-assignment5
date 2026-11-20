// Furkan Kaan Ünal — 2024502225
import { and, eq, lt } from "drizzle-orm";
import type { Db } from "./db.ts";
import { tasks } from "./schema.ts";
import type { TaskCache } from "./cache.ts";
import type { LiveTasks } from "./live.ts";
/** Completion time, rather than creation time, defines the retention period. */
export async function purgeOldDone(
  database: Db,
  days: number,
  cache?: TaskCache,
  live?: LiveTasks,
  uploadDir?: string,
  now = Date.now(),
) {
  const cutoff = Math.floor(now / 1000) - days * 86400;
  const candidates = await database.pool.use(({ db }) =>
    db.select().from(tasks).where(
      and(eq(tasks.status, "done"), lt(tasks.completedAt, cutoff)),
    )
  );
  let removed = 0;
  for (const row of candidates) {
    // Match route lock order: borrow a connection before taking the task lock.
    await database.pool.use(async ({ db }) => {
      const work = async () => {
        const deleted = await db.delete(tasks).where(
          and(
            eq(tasks.id, row.id),
            eq(tasks.status, "done"),
            lt(tasks.completedAt, cutoff),
          ),
        ).returning();
        if (!deleted.length) return;
        const current = deleted[0];
        await cache?.invalidate(current.userId, current.id);
        if (current.attachment && uploadDir) {
          await Deno.remove(`${uploadDir}/${current.attachment}`).catch(() => {});
        }
        live?.publish(current.userId, "purged", current);
        removed++;
      };
      if (cache) await cache.locked(row.userId, row.id, work);
      else await work();
    });
  }
  return removed;
}
