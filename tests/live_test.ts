// Furkan Kaan Ünal — 2024502225
import { assertEquals } from "@std/assert";
import { account, fixture, request } from "./helpers.ts";
export async function liveProbe() {
  const observations: string[] = [];
  await fixture(async (f) => {
    const token = await account(f);
    const other = await account(f, "live-other@example.com");
    const server = Deno.serve(
      { hostname: "127.0.0.1", port: 0, onListen() {} },
      f.app.fetch,
    );
    const base = `ws://127.0.0.1:${server.addr.port}/ws?token=`;
    const sockets = [
      new WebSocket(base + token),
      new WebSocket(base + token),
      new WebSocket(base + other),
    ];
    const messages: string[][] = [[], [], []];
    const opened = sockets.map((socket, i) =>
      new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error("WebSocket did not open"));
        socket.onmessage = (event) => messages[i].push(String(event.data));
      })
    );
    try {
      await Promise.all(opened);
      observations.push(
        "Opened two authenticated connections for the same user and one for another user.",
      );
      for (
        const [method, suffix, body] of [["POST", "", { title: "Shared live task" }], [
          "PUT",
          "/3",
          { title: "Changed live task", status: "done" },
        ], ["DELETE", "/3", undefined]] as const
      ) {
        const res = await request(f, `/api/tasks${suffix}`, method, body, token);
        assertEquals(res.status, method === "POST" ? 201 : 200);
        await new Promise((r) => setTimeout(r, 30));
      }
      assertEquals(messages[0].map((s) => JSON.parse(s).type), [
        "created",
        "updated",
        "deleted",
      ]);
      assertEquals(messages[1], messages[0]);
      assertEquals(messages[2], []);
      observations.push(
        "Both owner connections received created, updated and deleted with the same task payloads.",
      );
      observations.push("The other user's connection received 0 events.");
    } finally {
      await Promise.all(sockets.map((socket) =>
        new Promise<void>((resolve) => {
          if (socket.readyState === WebSocket.CLOSED) return resolve();
          socket.onclose = () => resolve();
          socket.close();
        })
      ));
      await server.shutdown();
    }
  });
  return observations;
}
Deno.test("live updates reach both owner connections but never another user", async () => {
  await liveProbe();
});
