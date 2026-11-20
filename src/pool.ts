// Furkan Kaan Ünal — 2024502225
/** FIFO waiters; a rejected job still returns its connection. */
export class Pool<T> {
  #idle: T[];
  #waiting: ((item: T) => void)[] = [];
  #borrowed = new Set<T>();
  constructor(items: T[]) {
    if (!items.length || new Set(items).size !== items.length) throw new Error("pool needs distinct items");
    this.#idle = [...items];
  }
  acquire(): Promise<T> {
    if (this.#idle.length) {
      const item = this.#idle.pop()!;
      this.#borrowed.add(item);
      return Promise.resolve(item);
    }
    return new Promise((resolve) => this.#waiting.push(resolve));
  }
  release(item: T): void {
    if (!this.#borrowed.has(item)) throw new Error("connection was not borrowed");
    const next = this.#waiting.shift();
    if (next) next(item);
    else { this.#borrowed.delete(item); this.#idle.push(item); }
  }
  async use<R>(fn: (item: T) => Promise<R>): Promise<R> {
    const item = await this.acquire();
    try { return await fn(item); } finally { this.release(item); }
  }
}
