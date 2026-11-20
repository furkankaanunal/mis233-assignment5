// Furkan Kaan Ünal — 2024502225
// Requires Docker; writes only a transcript after an actual successful build and restart.
async function docker(...args: string[]) {
  const result = await new Deno.Command("docker", {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) throw new Error(new TextDecoder().decode(result.stderr));
  return new TextDecoder().decode(result.stdout).trim();
}
const suffix = crypto.randomUUID().slice(0, 8);
const container = `tasks-api-probe-${suffix}`;
const volume = `tasks-api-data-${suffix}`;
const image = "mis233-tasks-api:local";
const secret = crypto.randomUUID() + crypto.randomUUID();
const transcript: string[] = [];
await docker("version");
try {
  transcript.push(await docker("build", "-t", image, "."));
  await docker("volume", "create", volume);
  const start = async () => {
    await docker(
      "run",
      "-d",
      "--name",
      container,
      "-p",
      "127.0.0.1::8000",
      "-v",
      `${volume}:/data`,
      "-e",
      `JWT_SECRET=${secret}`,
      image,
    );
    const port = (await docker("port", container, "8000/tcp")).split(":").at(-1);
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${base}/health`)).ok) return base;
      } catch { /* Wait for startup. */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("container did not become healthy");
  };
  const register = (base: string) =>
    fetch(`${base}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "docker@demo.example", password: "DockerDemo123!" }),
    });
  const first = await register(await start());
  transcript.push(`First registration: HTTP ${first.status} ${await first.text()}`);
  if (first.status !== 201) throw new Error("first registration failed");
  await docker("stop", container);
  await docker("rm", container);
  const second = await register(await start());
  transcript.push(
    `After container replacement using the same volume: HTTP ${second.status} ${await second
      .text()}`,
  );
  if (second.status !== 409) throw new Error("data did not persist");
  transcript.push(
    `Image: ${await docker(
      "image",
      "inspect",
      image,
      "--format",
      "{{.Size}} bytes; user={{.Config.User}}",
    )}`,
  );
  await Deno.mkdir("evidence", { recursive: true });
  await Deno.writeTextFile("evidence/docker.txt", transcript.join("\n") + "\n");
  console.log(transcript.join("\n"));
} finally {
  await docker("rm", "-f", container).catch(() => {});
  await docker("volume", "rm", volume).catch(() => {});
}
