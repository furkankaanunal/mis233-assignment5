// Furkan Kaan Ünal — 2024502225
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { and, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "./db.ts";
import type { Config } from "./config.ts";
import { checkPassword, type Env, hashPassword, requireAuth, requireRole, signToken, verifyToken } from "./auth.ts";
import { fail } from "./errors.ts";
import { tasks, users } from "./schema.ts";
import { TaskCache } from "./cache.ts";
import { LiveTasks } from "./live.ts";
import { LoginLimiter } from "./rate_limit.ts";
import { Credentials, EmptyQuery, errors, Id, json, Ok, PageQuery, TaskBody, TaskSchema, UserSchema, ErrorSchema } from "./validation.ts";

export type AppOptions = { config: Config; kv: Deno.Kv; log?: (line: string) => void; now?: () => number };
export function createApp(database: Db, options: AppOptions) {
  const { config } = options;
  const now = options.now ?? Date.now;
  const seconds = () => Math.floor(now() / 1000);
  const cache = new TaskCache(options.kv);
  const live = new LiveTasks();
  const limiter = new LoginLimiter(now);
  const app = new OpenAPIHono<Env>({ defaultHook: (result, c) => {
    if (!result.success) return fail(c, 400, "validation failed", result.error.issues.map((i) => ({ path: i.path.map((v) => typeof v === "symbol" ? String(v) : v), message: i.message })));
  } });
  app.use("*", async (c, next) => {
    const start = performance.now();
    const requestId = crypto.randomUUID();
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    await next();
    (options.log ?? console.log)(JSON.stringify({ requestId, method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - start) }));
  });
  app.onError((err, c) => {
    // Hono throws a 400 HTTPException for malformed JSON before Zod runs.
    if ("status" in err && err.status === 400) return fail(c, 400, "validation failed", [{ path: [], message: "Malformed JSON body" }]);
    return fail(c, 500, "internal server error");
  });
  app.notFound((c) => fail(c, 404, "not found"));
  app.use("/api/*", requireAuth(config.JWT_SECRET));
  app.use("/api/*", (c, next) => database.pool.use(async (connection) => { c.set("connection", connection); await next(); }));
  app.use("/api/admin/*", requireRole("admin"));
  const security = [{ Bearer: [] }];
  app.openAPIRegistry.registerComponent("securitySchemes", "Bearer", { type: "http", scheme: "bearer", bearerFormat: "JWT" });
  const empty = { query: EmptyQuery };
  for (const path of ["/health", "/healthz"] as const) {
    app.openapi(createRoute({ method: "get", path, request: empty, responses: { ...errors, 200: json(Ok) } }), (c) => c.json({ ok: true as const }, 200));
  }
  app.openapi(createRoute({ method: "get", path: "/readyz", request: empty, responses: { ...errors, 200: json(z.object({ ready: z.literal(true) })), 503: json(ErrorSchema) } }), async (c) => {
    try { await database.pool.use(({ db }) => db.run(sql`SELECT 1`)); return c.json({ ready: true as const }, 200); }
    catch { return fail(c, 503, "database not ready"); }
  });
  const credentials = { ...empty, body: { required: true, content: { "application/json": { schema: Credentials } } } };
  app.openapi(createRoute({ method: "post", path: "/auth/register", request: credentials, responses: { ...errors, 201: json(UserSchema), 409: json(ErrorSchema) } }), async (c) => {
    const { email, password } = c.req.valid("json");
    const passwordHash = await hashPassword(password);
    try {
      const user = await database.pool.use(({ db }) => db.transaction(async (tx) => {
        const [created] = await tx.insert(users).values({ email, passwordHash }).returning({ id: users.id, email: users.email });
        await tx.insert(tasks).values({ userId: created.id, title: "Welcome! Plan your first study session", priority: "low" });
        return created;
      }));
      return c.json(user, 201);
    } catch (err) {
      if (String(err).includes("UNIQUE constraint failed: users.email")) return fail(c, 409, "email already registered");
      throw err;
    }
  });
  app.openapi(createRoute({ method: "post", path: "/auth/login", request: credentials, responses: { ...errors, 200: json(z.object({ token: z.string() })), 429: json(ErrorSchema) } }), async (c) => {
    const { email, password } = c.req.valid("json");
    const retry = limiter.retryAfter(email);
    if (retry) { c.header("Retry-After", String(retry)); return fail(c, 429, "too many login attempts"); }
    const [user] = await database.pool.use(({ db }) => db.select().from(users).where(eq(users.email, email)));
    if (!user || !await checkPassword(password, user.passwordHash)) { limiter.failed(email); return fail(c, 401, "invalid email or password"); }
    limiter.clear(email);
    return c.json({ token: await signToken(user.id, user.role, config.JWT_SECRET) }, 200);
  });
  app.openapi(createRoute({ method: "get", path: "/api/admin/users", security, request: empty, responses: { ...errors, 200: json(z.array(UserSchema.extend({ role: z.enum(["user", "admin"]) }))), 403: json(ErrorSchema) } }), async (c) => {
    return c.json(await c.get("connection").db.select({ id: users.id, email: users.email, role: users.role }).from(users), 200);
  });
  app.openapi(createRoute({ method: "get", path: "/api/me/summary", security, request: empty, responses: { ...errors, 200: json(z.object({ todo: z.number(), "in-progress": z.number(), done: z.number() })) } }), async (c) => {
    const rows = await c.get("connection").db.select({ status: tasks.status, n: count() }).from(tasks).where(and(eq(tasks.userId, c.get("userId")), isNull(tasks.deletedAt))).groupBy(tasks.status);
    const result = { todo: 0, "in-progress": 0, done: 0 };
    for (const row of rows) result[row.status] = row.n;
    return c.json(result, 200);
  });
  app.openapi(createRoute({ method: "get", path: "/api/tasks", security, request: { query: PageQuery }, responses: { ...errors, 200: json(z.object({ items: z.array(TaskSchema), page: z.number(), limit: z.number(), total: z.number() })) } }), async (c) => {
    const { page, limit, status } = c.req.valid("query");
    const where = and(eq(tasks.userId, c.get("userId")), isNull(tasks.deletedAt), status ? eq(tasks.status, status) : undefined);
    const db = c.get("connection").db;
    // One read transaction gives the count and page the same snapshot.
    return c.json(await db.transaction(async (tx) => {
      const [{ total }] = await tx.select({ total: count() }).from(tasks).where(where);
      const items = await tx.select().from(tasks).where(where).orderBy(tasks.id).limit(limit).offset((page - 1) * limit);
      return { items, page, limit, total };
    }, { behavior: "deferred" }), 200);
  });
  const taskBody = { required: true, content: { "application/json": { schema: TaskBody } } };
  app.openapi(createRoute({ method: "post", path: "/api/tasks", security, request: { ...empty, body: taskBody }, responses: { ...errors, 201: json(TaskSchema) } }), async (c) => {
    const body = c.req.valid("json");
    const [task] = await c.get("connection").db.insert(tasks).values({ ...body, userId: c.get("userId"), completedAt: body.status === "done" ? seconds() : null }).returning();
    live.publish(task.userId, "created", task);
    return c.json(task, 201);
  });
  const taskRequest = { ...empty, params: Id };
  app.openapi(createRoute({ method: "get", path: "/api/tasks/{id}", security, request: taskRequest, responses: { ...errors, 200: json(TaskSchema) } }), (c) => {
    const { id } = c.req.valid("param"); const owner = c.get("userId");
    return cache.locked(owner, id, async () => {
      const task = await cache.get(owner, id, async () => (await c.get("connection").db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, owner), isNull(tasks.deletedAt))))[0]);
      return task ? c.json(task, 200) : fail(c, 404, "task not found");
    });
  });
  app.openapi(createRoute({ method: "put", path: "/api/tasks/{id}", security, request: { ...taskRequest, body: taskBody }, responses: { ...errors, 200: json(TaskSchema) } }), (c) => {
    const { id } = c.req.valid("param"); const owner = c.get("userId"); const body = c.req.valid("json");
    return cache.locked(owner, id, async () => {
      const [task] = await c.get("connection").db.update(tasks).set({ ...body, updatedAt: seconds(), completedAt: body.status === "done" ? sql`coalesce(${tasks.completedAt}, ${seconds()})` : null }).where(and(eq(tasks.id, id), eq(tasks.userId, owner), isNull(tasks.deletedAt))).returning();
      if (!task) return fail(c, 404, "task not found");
      await cache.invalidate(owner, id); live.publish(owner, "updated", task);
      return c.json(task, 200);
    });
  });
  app.openapi(createRoute({ method: "delete", path: "/api/tasks/{id}", security, request: taskRequest, responses: { ...errors, 200: json(Ok) } }), (c) => {
    const { id } = c.req.valid("param"); const owner = c.get("userId");
    return cache.locked(owner, id, async () => {
      const [task] = await c.get("connection").db.update(tasks).set({ deletedAt: seconds(), updatedAt: seconds() }).where(and(eq(tasks.id, id), eq(tasks.userId, owner), isNull(tasks.deletedAt))).returning();
      if (!task) return fail(c, 404, "task not found");
      await cache.invalidate(owner, id); live.publish(owner, "deleted", task);
      return c.json({ ok: true as const }, 200);
    });
  });
  app.openapi(createRoute({ method: "post", path: "/api/tasks/{id}/restore", security, request: taskRequest, responses: { ...errors, 200: json(TaskSchema) } }), (c) => {
    const { id } = c.req.valid("param"); const owner = c.get("userId");
    return cache.locked(owner, id, async () => {
      const [task] = await c.get("connection").db.update(tasks).set({ deletedAt: null, updatedAt: seconds() }).where(and(eq(tasks.id, id), eq(tasks.userId, owner), isNotNull(tasks.deletedAt))).returning();
      if (!task) return fail(c, 404, "deleted task not found");
      await cache.invalidate(owner, id); live.publish(owner, "restored", task);
      return c.json(task, 200);
    });
  });
  app.openapi(createRoute({ method: "post", path: "/api/tasks/{id}/attachment", security, request: { ...taskRequest, body: { required: true, content: { "multipart/form-data": { schema: z.object({ file: z.custom<File>((value) => value instanceof File, "file required").openapi({ type: "string", format: "binary" }) }) } } } }, responses: { ...errors, 200: json(TaskSchema), 413: json(ErrorSchema), 415: json(ErrorSchema) } }), (c) => {
    const { id } = c.req.valid("param"); const owner = c.get("userId");
    return cache.locked(owner, id, async () => {
      const db = c.get("connection").db;
      const [existing] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, owner), isNull(tasks.deletedAt)));
      if (!existing) return fail(c, 404, "task not found");
      const body = await c.req.parseBody(); const f = body.file;
      if (!z.instanceof(File).safeParse(f).success || !(f instanceof File)) return fail(c, 400, "file required");
      if (f.size > 1_000_000) return fail(c, 413, "too large");
      if (!["image/png", "image/jpeg"].includes(f.type)) return fail(c, 415, "type not allowed");
      const name = `${crypto.randomUUID()}.${f.type === "image/png" ? "png" : "jpg"}`;
      await Deno.mkdir(config.UPLOAD_DIR, { recursive: true });
      const path = `${config.UPLOAD_DIR}/${name}`;
      await Deno.writeFile(path, new Uint8Array(await f.arrayBuffer()));
      let task;
      try { [task] = await db.update(tasks).set({ attachment: name, updatedAt: seconds() }).where(eq(tasks.id, id)).returning(); }
      catch (err) { await Deno.remove(path); throw err; }
      await cache.invalidate(owner, id);
      if (existing.attachment) await Deno.remove(`${config.UPLOAD_DIR}/${existing.attachment}`).catch(() => {});
      live.publish(owner, "updated", task);
      return c.json(task, 200);
    });
  });
  app.openapi(createRoute({ method: "get", path: "/api/tasks/{id}/attachment", security, request: taskRequest, responses: { ...errors, 200: { description: "Image bytes", content: { "image/png": { schema: z.string().openapi({ format: "binary" }) }, "image/jpeg": { schema: z.string().openapi({ format: "binary" }) } } } } }), (c) => {
    const { id } = c.req.valid("param"); const owner = c.get("userId");
    return cache.locked(owner, id, async () => {
      const [task] = await c.get("connection").db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, owner), isNull(tasks.deletedAt)));
      if (!task?.attachment) return fail(c, 404, "attachment not found");
      try {
        const data = await Deno.readFile(`${config.UPLOAD_DIR}/${task.attachment}`);
        return c.body(data, 200, { "content-type": task.attachment.endsWith(".png") ? "image/png" : "image/jpeg", "x-content-type-options": "nosniff", "cache-control": "private, no-store" });
      } catch (err) { if (err instanceof Deno.errors.NotFound) return fail(c, 404, "attachment not found"); throw err; }
    });
  });
  app.openapi(createRoute({ method: "get", path: "/ws", request: { query: z.object({ token: z.string().default("") }).strict() }, responses: { ...errors, 101: { description: "Authenticated WebSocket" } } }), async (c) => {
    const identity = await verifyToken(c.req.valid("query").token, config.JWT_SECRET);
    if (!identity) return fail(c, 401, "unauthorized");
    if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return fail(c, 400, "websocket upgrade required");
    const { response, socket } = Deno.upgradeWebSocket(c.req.raw);
    live.attach(identity.userId, socket);
    return response;
  });
  app.doc("/openapi.json", { openapi: "3.0.0", info: { title: "Study Tasks API", version: "1.0.0" } });
  app.get("/docs", swaggerUI({ url: "/openapi.json" }));
  return Object.assign(app, { cache, live });
}
