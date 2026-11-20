// Furkan Kaan Ünal — 2024502225
import { assert, assertEquals } from "@std/assert";
import { account, fixture, request } from "./helpers.ts";
import { checkPassword, signToken } from "../src/auth.ts";
import { eq } from "drizzle-orm";
import { users } from "../src/schema.ts";
Deno.test("registration stores bcrypt but returns only id and email", () =>
  fixture(async (f) => {
    const res = await request(f, "/auth/register", "POST", {
      email: "new@example.com",
      password: "study1234",
    });
    assertEquals(res.status, 201);
    assertEquals(Object.keys(await res.json()).sort(), ["email", "id"]);
    const [user] = await f.database.db.select().from(users);
    assert(user.passwordHash.startsWith("$2"));
    assert(await checkPassword("study1234", user.passwordHash));
  }));
Deno.test("duplicate normalized email is 409", () =>
  fixture(async (f) => {
    await account(f);
    const res = await request(f, "/auth/register", "POST", {
      email: "STUDENT@example.com",
      password: "study1234",
    });
    assertEquals(res.status, 409);
  }));
Deno.test("invalid credentials body and short password are 400", () =>
  fixture(async (f) => {
    for (
      const body of [{ email: "bad", password: "study1234" }, {
        email: "a@b.com",
        password: "short",
      }, { email: "a@b.com", password: "study1234", role: "admin" }]
    ) assertEquals((await request(f, "/auth/register", "POST", body)).status, 400);
  }));
Deno.test("wrong email and wrong password use the same 401 message", () =>
  fixture(async (f) => {
    await account(f);
    const first = await request(f, "/auth/login", "POST", {
      email: "student@example.com",
      password: "wrong123",
    });
    const second = await request(f, "/auth/login", "POST", {
      email: "unknown@example.com",
      password: "wrong123",
    });
    assertEquals(first.status, 401);
    assertEquals(second.status, 401);
    assertEquals((await first.json()).error, (await second.json()).error);
  }));
Deno.test("every API path requires authentication", () =>
  fixture(async (f) => {
    for (
      const path of ["/api/tasks", "/api/admin/users", "/api/me/summary", "/api/unknown"]
    ) assertEquals((await request(f, path)).status, 401);
  }));
Deno.test("tampered, expired and wrong-secret JWTs are rejected", () =>
  fixture(async (f) => {
    const token = await account(f);
    const parts = token.split(".");
    parts[2] = (parts[2][0] === "a" ? "b" : "a") + parts[2].slice(1);
    for (
      const invalid of [
        parts.join("."),
        await signToken(1, "user", f.config.JWT_SECRET, 1),
        await signToken(1, "user", "another-secret"),
      ]
    ) {
      assertEquals(
        (await request(f, "/api/tasks", "GET", undefined, invalid)).status,
        401,
      );
    }
  }));
Deno.test("RBAC returns 401, 403 and 200 and never exposes hashes", () =>
  fixture(async (f) => {
    const token = await account(f);
    assertEquals((await request(f, "/api/admin/users")).status, 401);
    assertEquals(
      (await request(f, "/api/admin/users", "GET", undefined, token)).status,
      403,
    );
    await f.database.db.update(users).set({ role: "admin" }).where(eq(users.id, 1));
    const login = await request(f, "/auth/login", "POST", {
      email: "student@example.com",
      password: "study1234",
    });
    const admin = (await login.json()).token;
    const res = await request(f, "/api/admin/users", "GET", undefined, admin);
    assertEquals(res.status, 200);
    assert(!(await res.text()).includes("passwordHash"));
  }));
Deno.test("sixth login after five failures returns 429 even for correct password", () =>
  fixture(async (f) => {
    await account(f);
    for (let i = 0; i < 5; i++) {
      assertEquals(
        (await request(f, "/auth/login", "POST", {
          email: "student@example.com",
          password: "wrong123",
        })).status,
        401,
      );
    }
    const res = await request(f, "/auth/login", "POST", {
      email: "student@example.com",
      password: "study1234",
    });
    assertEquals(res.status, 429);
    assert(Number(res.headers.get("Retry-After")) > 0);
  }));
Deno.test("limiter window expires and successful login clears failures", async () => {
  let time = Date.now();
  await fixture(async (f) => {
    await account(f);
    for (let i = 0; i < 4; i++) {
      await request(f, "/auth/login", "POST", {
        email: "student@example.com",
        password: "wrong123",
      });
    }
    assertEquals(
      (await request(f, "/auth/login", "POST", {
        email: "student@example.com",
        password: "study1234",
      })).status,
      200,
    );
    for (let i = 0; i < 5; i++) {
      await request(f, "/auth/login", "POST", {
        email: "student@example.com",
        password: "wrong123",
      });
    }
    time += 60_001;
    assertEquals(
      (await request(f, "/auth/login", "POST", {
        email: "student@example.com",
        password: "study1234",
      })).status,
      200,
    );
  }, () => time);
});
Deno.test("logs omit passwords and WebSocket query tokens", () =>
  fixture(async (f) => {
    await account(f);
    await request(f, "/ws?token=TOP_SECRET");
    const logs = f.logs.join("\n");
    assert(!logs.includes("study1234"));
    assert(!logs.includes("TOP_SECRET"));
    for (const log of f.logs) {
      const row = JSON.parse(log);
      assert(row.requestId);
      assertEquals(typeof row.ms, "number");
    }
  }));
Deno.test("bad WebSocket token is 401", () =>
  fixture(async (f) => {
    assertEquals((await request(f, "/ws?token=bad")).status, 401);
  }));
Deno.test("passwords longer than bcrypt's 72-byte limit are rejected", () =>
  fixture(async (f) => {
    const prefix = "é".repeat(36);
    const res = await request(f, "/auth/register", "POST", {
      email: "unicode@example.com",
      password: prefix + "X",
    });
    assertEquals(res.status, 400);
    assertEquals((await f.database.db.select().from(users)).length, 0);
    assertEquals(
      (await request(f, "/auth/login", "POST", {
        email: "unicode@example.com",
        password: prefix + "Y",
      })).status,
      400,
    );
    assertEquals(
      (await request(f, "/auth/register", "POST", {
        email: "boundary@example.com",
        password: prefix,
      })).status,
      201,
    );
    assertEquals(
      (await request(f, "/auth/login", "POST", {
        email: "boundary@example.com",
        password: prefix,
      })).status,
      200,
    );
    assertEquals(
      (await request(f, "/auth/login", "POST", {
        email: "boundary@example.com",
        password: "é".repeat(35) + "ê",
      })).status,
      401,
    );
  }));
Deno.test("short wrong login password follows the handout's 401 example", () =>
  fixture(async (f) => {
    await account(f);
    const res = await request(f, "/auth/login", "POST", {
      email: "student@example.com",
      password: "wrong",
    });
    assertEquals(res.status, 401);
    assertEquals((await res.json()).error, "invalid email or password");
  }));
