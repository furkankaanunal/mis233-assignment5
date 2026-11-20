// Furkan Kaan Ünal — 2024502225
import { assert, assertEquals, assertRejects } from "@std/assert";
import { account, add, fixture, request } from "./helpers.ts";
import { tasks, users } from "../src/schema.ts";
import { eq } from "drizzle-orm";
import { Pool } from "../src/pool.ts";
import { purgeOldDone } from "../src/jobs.ts";
import { seed } from "../scripts/seed.ts";
Deno.test("20 jobs on a pool of 3 finish with at most 3 active", async () => {
  const pool = new Pool([1, 2, 3]);
  let active = 0;
  let peak = 0;
  let completed = 0;
  await Promise.all(Array.from({ length: 20 }, () =>
    pool.use(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      completed++;
    })));
  assertEquals(peak, 3);
  assertEquals(completed, 20);
});
Deno.test("pool releases on rejection and serves waiters FIFO", async () => {
  const pool = new Pool([1]);
  await assertRejects(() => pool.use(() => Promise.reject(new Error("expected"))));
  const first = await pool.acquire();
  const order: number[] = [];
  const a = pool.use(() => {
    order.push(1);
    return Promise.resolve();
  });
  const b = pool.use(() => {
    order.push(2);
    return Promise.resolve();
  });
  pool.release(first);
  await Promise.all([a, b]);
  assertEquals(order, [1, 2]);
});
Deno.test("cache hit skips load, is scoped by owner and mutation invalidates", () =>
  fixture(async (f) => {
    const token = await account(f);
    const task = await add(f, token);
    let reads = 0;
    const load = async () => {
      reads++;
      return (await f.database.db.select().from(tasks).where(eq(tasks.id, task.id)))[0];
    };
    await f.app.cache.get(1, task.id, load);
    await f.app.cache.get(1, task.id, load);
    assertEquals(reads, 1);
    assertEquals((await f.kv.get(["task", 2, task.id])).value, null);
    const other = await account(f, "cache-other@example.com");
    assertEquals(
      (await request(f, `/api/tasks/${task.id}`, "GET", undefined, other)).status,
      404,
    );
    await request(f, `/api/tasks/${task.id}`, "PUT", { title: "Fresh value" }, token);
    assertEquals(
      (await (await request(f, `/api/tasks/${task.id}`, "GET", undefined, token)).json())
        .title,
      "Fresh value",
    );
    await request(f, `/api/tasks/${task.id}`, "DELETE", undefined, token);
    assertEquals((await f.kv.get(["task", 1, task.id])).value, null);
  }));
Deno.test("cache lock prevents a concurrent update from leaving a stale fill", () =>
  fixture(async (f) => {
    const token = await account(f);
    const task = await add(f, token);
    await Promise.all([
      request(f, `/api/tasks/${task.id}`, "GET", undefined, token),
      request(f, `/api/tasks/${task.id}`, "PUT", { title: "After race" }, token),
    ]);
    assertEquals(
      (await (await request(f, `/api/tasks/${task.id}`, "GET", undefined, token)).json())
        .title,
      "After race",
    );
  }));
Deno.test("purge removes old completions only, invalidates cache and is idempotent", () =>
  fixture(async (f) => {
    const token = await account(f);
    const now = Math.floor(Date.now() / 1000);
    const old = now - 31 * 86400;
    const [a, b, c] = await f.database.db.insert(tasks).values([
      { userId: 1, title: "Old done", status: "done", completedAt: old },
      {
        userId: 1,
        title: "Old creation recently done",
        status: "done",
        createdAt: old,
        completedAt: now,
      },
      { userId: 1, title: "Old todo", createdAt: old },
    ]).returning();
    await request(f, `/api/tasks/${a.id}`, "GET", undefined, token);
    assertEquals(await purgeOldDone(f.database, 30, f.app.cache), 1);
    assertEquals(await purgeOldDone(f.database, 30, f.app.cache), 0);
    assertEquals((await f.kv.get(["task", 1, a.id])).value, null);
    const ids = (await f.database.db.select().from(tasks)).map((t) => t.id);
    assert(ids.includes(b.id));
    assert(ids.includes(c.id));
    assert(!ids.includes(a.id));
  }));
Deno.test("seed is safe twice and refuses production", () =>
  fixture(async (f) => {
    await seed(f.database, "test");
    const first = await f.database.db.select().from(tasks);
    await seed(f.database, "test");
    assertEquals((await f.database.db.select().from(users)).length, 2);
    assertEquals((await f.database.db.select().from(tasks)).length, first.length);
    assertEquals(first.length, 20);
    await assertRejects(() => seed(f.database, "production"), Error, "production");
  }));
Deno.test("attachment upload and download preserve bytes and invalidate cached task", () =>
  fixture(async (f) => {
    const token = await account(f);
    const task = await add(f, token);
    await request(f, `/api/tasks/${task.id}`, "GET", undefined, token);
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const form = new FormData();
    form.set("file", new File([bytes], "../../unsafe.png", { type: "image/png" }));
    const uploaded = await f.app.request(`/api/tasks/${task.id}/attachment`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    assertEquals(uploaded.status, 200);
    const data = await uploaded.json();
    assert(/^[a-f0-9-]+\.png$/.test(data.attachment));
    const downloaded = await request(
      f,
      `/api/tasks/${task.id}/attachment`,
      "GET",
      undefined,
      token,
    );
    assertEquals(downloaded.status, 200);
    assertEquals(downloaded.headers.get("content-type"), "image/png");
    assertEquals(new Uint8Array(await downloaded.arrayBuffer()), bytes);
    assertEquals(
      (await (await request(f, `/api/tasks/${task.id}`, "GET", undefined, token)).json())
        .attachment,
      data.attachment,
    );
    const other = await account(f, "file-other@example.com");
    assertEquals(
      (await request(f, `/api/tasks/${task.id}/attachment`, "GET", undefined, other))
        .status,
      404,
    );
  }));
for (
  const [name, file, expected] of [["missing file", null, 400], [
    "oversized",
    new File([new Uint8Array(1_000_001)], "a.png", { type: "image/png" }),
    413,
  ], ["wrong type", new File(["txt"], "a.txt", { type: "text/plain" }), 415]] as const
) {
  Deno.test(`attachment rejects ${name}`, () =>
    fixture(async (f) => {
      const token = await account(f);
      const task = await add(f, token);
      const form = new FormData();
      if (file) form.set("file", file);
      else form.set("other", "x");
      const res = await f.app.request(`/api/tasks/${task.id}/attachment`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
      assertEquals(res.status, expected);
    }));
}
