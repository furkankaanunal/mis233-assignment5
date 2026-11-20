// Furkan Kaan Ünal — 2024502225
import type { Task } from "./schema.ts";
/** Per-task queue prevents a slow cache fill from overwriting a mutation. */
export class TaskCache {
  #queues = new Map<string, Promise<void>>();
  constructor(readonly kv: Deno.Kv) {}
  async locked<T>(userId: number, id: number, fn: () => Promise<T>): Promise<T> {
    const key = `${userId}:${id}`;
    const previous = this.#queues.get(key) ?? Promise.resolve();
    let unlock!: () => void;
    const current = new Promise<void>((resolve) => unlock = resolve);
    this.#queues.set(key, current);
    await previous;
    try {
      return await fn();
    } finally {
      unlock();
      if (this.#queues.get(key) === current) this.#queues.delete(key);
    }
  }
  async get(userId: number, id: number, load: () => Promise<Task | undefined>) {
    const key = ["task", userId, id];
    const hit = await this.kv.get<Task>(key);
    if (hit.value) return hit.value;
    const row = await load();
    if (row) await this.kv.set(key, row, { expireIn: 60_000 });
    return row;
  }
  async invalidate(userId: number, id: number) {
    await this.kv.delete(["task", userId, id]);
  }
}
