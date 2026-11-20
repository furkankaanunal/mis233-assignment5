// Furkan Kaan Ünal — 2024502225
import { freshApp } from "../tests/helpers.ts";
import { signToken } from "../src/auth.ts";
import { benchmark } from "./benchmark.ts";
import { liveProbe } from "../tests/live_test.ts";
import { seed } from "./seed.ts";
await Deno.mkdir("evidence", { recursive: true });
const f = await freshApp();
const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, f.app.fetch);
const base = `http://127.0.0.1:${server.addr.port}`;
const transcript: string[] = [
  "# Actual curl requests and responses",
  "",
  `Captured ${
    new Date().toISOString()
  } with Deno ${Deno.version.deno}. The database was temporary. Demo credentials and the local test JWT below are disposable.`,
  "",
];
async function curl(
  path: string,
  method = "GET",
  body?: unknown,
  token?: string,
  extra: string[] = [],
) {
  const args = ["-sS", "-i", "-X", method, `${base}${path}`];
  if (body !== undefined) {
    args.push("-H", "content-type: application/json", "-d", JSON.stringify(body));
  }
  if (token) args.push("-H", `Authorization: Bearer ${token}`);
  args.push(...extra);
  const result = await new Deno.Command("curl", {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) throw new Error(new TextDecoder().decode(result.stderr));
  const output = new TextDecoder().decode(result.stdout);
  const display = args.map((a) => `'${a.replaceAll("'", "'\\''")}'`).join(" ");
  transcript.push(
    `## ${method} ${path}`,
    "",
    "```sh",
    `curl ${display}`,
    "```",
    "",
    "```text",
    output.trim(),
    "```",
    "",
  );
  return output.slice(output.indexOf("\r\n\r\n") + 4);
}
try {
  await curl("/health");
  await curl("/healthz");
  await curl("/readyz");
  await curl("/auth/register", "POST", {
    email: "curl@example.com",
    password: "CurlStudy123!",
  });
  const login = JSON.parse(
    await curl("/auth/login", "POST", {
      email: "curl@example.com",
      password: "CurlStudy123!",
    }),
  );
  const token = login.token as string;
  const task = JSON.parse(
    await curl("/api/tasks", "POST", {
      title: "Prepare MIS 233 API demo",
      priority: "high",
      dueDate: "2026-12-01",
    }, token),
  );
  await curl("/api/tasks?page=1&limit=2", "GET", undefined, token);
  await curl(`/api/tasks/${task.id}`, "GET", undefined, token);
  await curl(`/api/tasks/${task.id}`, "PUT", {
    title: "Prepare MIS 233 API demo",
    status: "done",
    priority: "high",
  }, token);
  const png = `${f.config.UPLOAD_DIR}/demo.png`;
  await Deno.mkdir(f.config.UPLOAD_DIR, { recursive: true });
  await Deno.writeFile(
    png,
    Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6i8AAAAASUVORK5CYII=",
      ),
      (s) => s.charCodeAt(0),
    ),
  );
  await curl(`/api/tasks/${task.id}/attachment`, "POST", undefined, token, [
    "-F",
    `file=@${png};type=image/png`,
  ]);
  const imageOutput = `${f.config.UPLOAD_DIR}/download.png`;
  await curl(`/api/tasks/${task.id}/attachment`, "GET", undefined, token, [
    "-o",
    imageOutput,
    "-w",
    "Downloaded image with status %{http_code}; content-type %{content_type}; bytes %{size_download}\n",
  ]);
  await curl("/api/me/summary", "GET", undefined, token);
  await curl(`/api/tasks/${task.id}`, "DELETE", undefined, token);
  await curl(`/api/tasks/${task.id}/restore`, "POST", undefined, token);
  await curl("/api/admin/users", "GET", undefined, token);
  await seed(f.database, "test");
  const admin = await signToken(3, "admin", f.config.JWT_SECRET);
  await curl("/api/admin/users", "GET", undefined, admin);
  await curl("/api/tasks");
  await curl("/ws?token=invalid");
  await curl("/api/tasks?limit=101", "GET", undefined, token);
  await curl("/auth/register", "POST", {
    email: "curl@example.com",
    password: "CurlStudy123!",
  });
  await curl("/unknown");
  await Deno.writeTextFile("evidence/curl.md", transcript.join("\n"));
  await Deno.writeTextFile("evidence/requests.jsonl", f.logs.join("\n") + "\n");
  const doc = await (await f.app.request("/openapi.json")).text();
  await Deno.writeTextFile(
    "evidence/openapi.json",
    JSON.stringify(JSON.parse(doc), null, 2) + "\n",
  );
} finally {
  await server.shutdown();
  await f.close();
}
await Deno.writeTextFile(
  "evidence/benchmark.json",
  JSON.stringify(await benchmark(), null, 2) + "\n",
);
await Deno.writeTextFile("evidence/live.txt", (await liveProbe()).join("\n") + "\n");
console.log(
  "Recorded curl, SQL benchmark, request logs, OpenAPI and live WebSocket evidence.",
);
