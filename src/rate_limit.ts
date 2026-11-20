// Furkan Kaan Ünal — 2024502225
export class LoginLimiter {
  #fails = new Map<string, { count: number; resetAt: number }>();
  constructor(private now = Date.now) {}
  retryAfter(email: string) {
    const entry = this.#fails.get(email);
    if (entry && entry.resetAt <= this.now()) { this.#fails.delete(email); return 0; }
    return entry && entry.count >= 5 ? Math.max(1, Math.ceil((entry.resetAt - this.now()) / 1000)) : 0;
  }
  failed(email: string) {
    // Bounded cleanup also removes expired keys that are never visited again.
    for (const [key, value] of this.#fails) if (value.resetAt <= this.now()) this.#fails.delete(key);
    const previous = this.#fails.get(email);
    this.#fails.set(email, previous ? { ...previous, count: previous.count + 1 } : { count: 1, resetAt: this.now() + 60_000 });
  }
  clear(email: string) { this.#fails.delete(email); }
}
