// Furkan Kaan Ünal — 2024502225
import { assert, assertEquals } from "@std/assert";
import { account, add, fixture, request } from "./helpers.ts";
import { tasks, users } from "../src/schema.ts";
import { eq } from "drizzle-orm";
Deno.test("CRUD uses task defaults and owner", () =>
  fixture(async (f) => {
    const token = await account(f);
    const task = await add(f, token);
    const fetched =
      await (await request(f, `/api/tasks/${task.id}`, "GET", undefined, token)).json();
    assertEquals(fetched.priority, "medium");
    assertEquals(fetched.status, "todo");
    assertEquals(fetched.userId, 1);
    assertEquals(typeof fetched.createdAt, "number");
    const updated = await request(f, `/api/tasks/${task.id}`, "PUT", {
      title: "Finish review",
      status: "done",
      priority: "high",
      dueDate: "2026-12-01",
    }, token);
    assertEquals(updated.status, 200);
    assert((await updated.json()).completedAt);
    assertEquals(
      (await request(f, `/api/tasks/${task.id}`, "DELETE", undefined, token)).status,
      200,
    );
    assertEquals(
      (await request(f, `/api/tasks/${task.id}`, "GET", undefined, token)).status,
      404,
    );
  }));
Deno.test("another user sees 404 on read, update, delete, restore and attachment", () =>
  fixture(async (f) => {
    const owner = await account(f);
    const other = await account(f, "other@example.com");
    const task = await add(f, owner);
    for (
      const [method, suffix, body] of [
        ["GET", "", undefined],
        ["PUT", "", { title: "Steal" }],
        ["DELETE", "", undefined],
        ["POST", "/restore", undefined],
        ["GET", "/attachment", undefined],
      ] as const
    ) {
      assertEquals(
        (await request(f, `/api/tasks/${task.id}${suffix}`, method, body, other)).status,
        404,
      );
    }
  }));
Deno.test("invalid status, priority and title are 400", () =>
  fixture(async (f) => {
    const token = await account(f);
    for (
      const body of [
        { title: "" },
        { title: "   " },
        { title: "x".repeat(101) },
        { title: "Study", status: "invalid" },
        { title: "Study", priority: "urgent" },
        { title: "Study", userId: 2 },
        { title: "Study", dueDate: "not-a-date" },
      ]
    ) assertEquals((await request(f, "/api/tasks", "POST", body, token)).status, 400);
  }));
Deno.test("malformed JSON uses the common 400 error shape", () =>
  fixture(async (f) => {
    const token = await account(f);
    const res = await f.app.request("/api/tasks", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{",
    });
    assertEquals(res.status, 400);
    const data = await res.json();
    assertEquals(data.error, "validation failed");
    assert(Array.isArray(data.issues));
    assert(data.requestId);
  }));
Deno.test("page two holds the right items and counts only this user", () =>
  fixture(async (f) => {
    const token = await account(f);
    await add(f, token, "First");
    const second = await add(f, token, "Second");
    await add(f, token, "Third");
    await account(f, "other@example.com");
    const data =
      await (await request(f, "/api/tasks?page=2&limit=2", "GET", undefined, token))
        .json();
    assertEquals(data.page, 2);
    assertEquals(data.limit, 2);
    assertEquals(data.total, 4);
    assertEquals(data.items.map((t: { title: string }) => t.title), ["Second", "Third"]);
    assertEquals(data.items[0].id, second.id);
  }));
Deno.test("bad page, limit and unknown query values are 400", () =>
  fixture(async (f) => {
    const token = await account(f);
    for (
      const query of [
        "page=0",
        "page=abc",
        "page=1.5",
        "limit=101",
        "limit=0",
        "status=no",
        "unknown=x",
        "page=9007199254740992",
      ]
    ) {
      assertEquals(
        (await request(f, `/api/tasks?${query}`, "GET", undefined, token)).status,
        400,
      );
    }
  }));
Deno.test("filter returns matching statuses and summary is grouped", () =>
  fixture(async (f) => {
    const token = await account(f);
    await add(f, token, "Read", "done");
    await add(f, token, "Write", "in-progress");
    const data =
      await (await request(f, "/api/tasks?status=done", "GET", undefined, token)).json();
    assertEquals(data.total, 1);
    assertEquals(
      await (await request(f, "/api/me/summary", "GET", undefined, token)).json(),
      { todo: 1, "in-progress": 1, done: 1 },
    );
  }));
Deno.test("delete hides a row and restore works once", () =>
  fixture(async (f) => {
    const token = await account(f);
    const task = await add(f, token);
    await request(f, `/api/tasks/${task.id}`, "DELETE", undefined, token);
    assertEquals(
      (await (await request(f, "/api/tasks", "GET", undefined, token)).json()).total,
      1,
    );
    const [stored] = await f.database.db.select().from(tasks).where(
      eq(tasks.id, task.id),
    );
    assert(stored.deletedAt);
    assertEquals(
      (await request(f, `/api/tasks/${task.id}/restore`, "POST", undefined, token))
        .status,
      200,
    );
    assertEquals(
      (await request(f, `/api/tasks/${task.id}/restore`, "POST", undefined, token))
        .status,
      404,
    );
    assertEquals(
      (await request(f, `/api/tasks/${task.id}`, "GET", undefined, token)).status,
      200,
    );
  }));
Deno.test("welcome task failure rolls registration back", () =>
  fixture(async (f) => {
    await f.database.client.execute(
      "CREATE TRIGGER fail_welcome BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'forced welcome failure'); END",
    );
    const res = await request(f, "/auth/register", "POST", {
      email: "rollback@example.com",
      password: "study1234",
    });
    assertEquals(res.status, 500);
    assertEquals((await res.json()).requestId, res.headers.get("x-request-id"));
    assertEquals(await f.database.db.select().from(users), []);
  }));
Deno.test("invalid task id is 400 and missing task is 404", () =>
  fixture(async (f) => {
    const token = await account(f);
    assertEquals(
      (await request(f, "/api/tasks/no", "GET", undefined, token)).status,
      400,
    );
    assertEquals(
      (await request(f, "/api/tasks/999", "GET", undefined, token)).status,
      404,
    );
  }));
Deno.test("SQL-looking title is stored as data", () =>
  fixture(async (f) => {
    const token = await account(f);
    const title = "'); DROP TABLE users; --";
    const task = await add(f, token, title);
    assertEquals(task.title, title);
    assertEquals((await f.database.db.select().from(users)).length, 1);
  }));
