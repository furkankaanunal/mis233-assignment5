// Furkan Kaan Ünal — 2024502225
import { assert, assertEquals, assertThrows } from "@std/assert";
import { fixture, request } from "./helpers.ts";
import { parseConfig } from "../src/config.ts";
for (const path of ["/health", "/healthz", "/readyz"]) {
  Deno.test(`${path} is healthy`, () =>
    fixture(async (f) => {
      const res = await request(f, path);
      assertEquals(res.status, 200);
      assert(res.headers.get("x-request-id"));
    }));
}
Deno.test("readiness reports database failure", () =>
  fixture(async (f) => {
    f.database.close();
    const res = await request(f, "/readyz");
    assertEquals(res.status, 503);
    assertEquals((await res.json()).error, "database not ready");
  }));
Deno.test("bad configuration and development production secret are refused", () => {
  assertThrows(() => parseConfig({}));
  assertThrows(() =>
    parseConfig({
      PORT: "wrong",
      DATABASE_URL: "file:x",
      JWT_SECRET: "test-secret",
      APP_ENV: "test",
    })
  );
  assertThrows(() =>
    parseConfig({
      PORT: "8000",
      DATABASE_URL: "file:x",
      JWT_SECRET: "dev-secret",
      APP_ENV: "production",
    })
  );
});
Deno.test("unknown route errors have request id and issues", () =>
  fixture(async (f) => {
    const res = await request(f, "/missing");
    const data = await res.json();
    assertEquals(res.status, 404);
    assertEquals(data.issues, []);
    assertEquals(data.requestId, res.headers.get("x-request-id"));
  }));
Deno.test("OpenAPI describes required and bonus routes with bearer security", () =>
  fixture(async (f) => {
    const doc = await (await request(f, "/openapi.json")).json();
    for (
      const path of [
        "/auth/register",
        "/auth/login",
        "/api/tasks",
        "/api/tasks/{id}",
        "/api/tasks/{id}/restore",
        "/api/tasks/{id}/attachment",
        "/api/me/summary",
        "/api/admin/users",
        "/ws",
        "/healthz",
        "/readyz",
      ]
    ) assert(doc.paths[path], path);
    assertEquals(doc.paths["/api/tasks"].get.security, [{ Bearer: [] }]);
    assert(doc.paths["/api/tasks/{id}"].get.responses["404"]);
    assertEquals((await request(f, "/docs")).status, 200);
  }));
