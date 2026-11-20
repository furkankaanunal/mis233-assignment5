// Furkan Kaan Ünal — 2024502225
import type { Task } from "./schema.ts";
export class LiveTasks {
  readonly clients = new Map<number, Set<WebSocket>>();
  attach(userId: number, socket: WebSocket) {
    socket.onopen = () => {
      const set = this.clients.get(userId) ?? new Set<WebSocket>();
      set.add(socket);
      this.clients.set(userId, set);
    };
    const remove = () => {
      const set = this.clients.get(userId);
      set?.delete(socket);
      if (!set?.size) this.clients.delete(userId);
    };
    socket.onclose = remove;
    socket.onerror = remove;
  }
  publish(userId: number, type: string, task: Task) {
    for (const socket of this.clients.get(userId) ?? []) {
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ type, task }));
        } catch {
          socket.close();
        }
      }
    }
  }
  close() {
    for (const sockets of this.clients.values()) {
      for (const socket of sockets) socket.close();
    }
  }
}
