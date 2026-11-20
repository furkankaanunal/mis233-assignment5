// Furkan Kaan Ünal — 2024502225
import { createDb, type Db, migrate } from "../src/db.ts";
import { loadConfig } from "../src/config.ts";
import { tasks, users } from "../src/schema.ts";
import { hashPassword } from "../src/auth.ts";
import { eq } from "drizzle-orm";
export async function seed(database: Db, appEnv: string) {
  if (appEnv === "production") throw new Error("Seed refused in production");
  const passwordHash = await hashPassword("DemoStudy123!");
  await database.pool.use(({ db }) =>
    db.transaction(async (tx) => {
      for (
        const [email, role] of [["student@demo.example", "user"], [
          "admin@demo.example",
          "admin",
        ]] as const
      ) {
        await tx.insert(users).values({ email, role, passwordHash })
          .onConflictDoNothing();
        const [user] = await tx.select().from(users).where(eq(users.email, email));
        if (
          (await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.userId, user.id))
            .limit(1)).length
        ) continue;
        await tx.insert(tasks).values(Array.from({ length: 10 }, (_, i) => ({
          userId: user.id,
          title: `${i + 1}. ${
            [
              "Read lecture slides",
              "Solve past exam",
              "Review API tests",
              "Prepare internship notes",
              "Plan next study block",
            ][i % 5]
          }`,
          status: i % 3 === 0
            ? "done" as const
            : i % 3 === 1
            ? "in-progress" as const
            : "todo" as const,
          priority: i % 2 ? "medium" as const : "high" as const,
          completedAt: i % 3 === 0 ? Math.floor(Date.now() / 1000) : null,
        })));
      }
    })
  );
}
if (import.meta.main) {
  const config = loadConfig();
  const database = createDb(
    config.DATABASE_URL,
    config.POOL_SIZE,
    config.DATABASE_AUTH_TOKEN,
  );
  try {
    await migrate(database);
    await seed(database, config.APP_ENV);
    console.log("Demo seed complete: 2 users, 10 tasks each (existing tasks kept).");
  } finally {
    database.close();
  }
}
