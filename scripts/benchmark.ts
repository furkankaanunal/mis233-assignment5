// Furkan Kaan Ünal — 2024502225
import { createDb, migrate } from "../src/db.ts";
import { tasks, users } from "../src/schema.ts";
import { and, count, eq, isNull } from "drizzle-orm";
export async function benchmark() {
  const dir = await Deno.makeTempDir();
  const logs: string[] = [];
  const database = createDb(`file:${dir}/bench.db`, 1, undefined, {
    logQuery(query, params) {
      logs.push(`${query} -- ${JSON.stringify(params)}`);
    },
  });
  try {
    await migrate(database);
    const people = await database.db.insert(users).values(
      Array.from(
        { length: 20 },
        (_, i) => ({
          email: `bench${i}@example.com`,
          passwordHash: "benchmark-only-never-log-in",
        }),
      ),
    ).returning();
    for (const user of people) {
      for (let offset = 0; offset < 1000; offset += 100) {
        await database.db.insert(tasks).values(
          Array.from(
            { length: 100 },
            (_, i) => ({
              userId: user.id,
              title: `Benchmark ${offset + i}`,
              status: i % 2 ? "todo" as const : "done" as const,
            }),
          ),
        );
      }
    }
    await database.client.execute("DROP INDEX idx_tasks_user_status");
    const query = {
      sql: "SELECT * FROM tasks WHERE user_id = ? AND status = ?",
      args: [2, "done"],
    };
    const plan = () =>
      database.client.execute({ ...query, sql: `EXPLAIN QUERY PLAN ${query.sql}` });
    const timed = async () => {
      const start = performance.now();
      for (let i = 0; i < 30; i++) await database.client.execute(query);
      return Number(((performance.now() - start) / 30).toFixed(3));
    };
    const before = { plan: (await plan()).rows, msPerQuery: await timed() };
    await database.client.execute(
      "CREATE INDEX idx_tasks_user_status ON tasks(user_id, status)",
    );
    const after = { plan: (await plan()).rows, msPerQuery: await timed() };
    logs.length = 0;
    // The handout's first summary version: load rows, then count each status.
    await database.db.select().from(tasks).where(
      and(eq(tasks.userId, 2), isNull(tasks.deletedAt)),
    );
    const naiveCounts = { todo: 0, "in-progress": 0, done: 0 };
    for (const status of ["todo", "in-progress", "done"] as const) {
      const [{ n }] = await database.db.select({ n: count() }).from(tasks).where(
        and(eq(tasks.userId, 2), isNull(tasks.deletedAt), eq(tasks.status, status)),
      );
      naiveCounts[status] = n;
    }
    const naiveSummary = { queries: logs.length, sql: [...logs], summary: naiveCounts };
    logs.length = 0;
    // Deliberately naive: load rows, then look up each task owner's email again.
    const rows = await database.db.select().from(tasks).where(eq(tasks.userId, 2)).limit(
      10,
    );
    for (const row of rows) {
      await database.db.select({ email: users.email }).from(users).where(
        eq(users.id, row.userId),
      );
    }
    const naive = { queries: logs.length, sql: [...logs] };
    logs.length = 0;
    const summary = await database.db.select({ status: tasks.status, n: count() }).from(
      tasks,
    ).where(and(eq(tasks.userId, 2), isNull(tasks.deletedAt))).groupBy(tasks.status);
    const grouped = { queries: logs.length, sql: [...logs], summary };
    return {
      rows: 20000,
      users: 20,
      iterations: 30,
      before,
      after,
      naiveSummary,
      naive,
      grouped,
    };
  } finally {
    database.close();
    await Deno.remove(dir, { recursive: true });
  }
}
if (import.meta.main) console.log(JSON.stringify(await benchmark(), null, 2));
