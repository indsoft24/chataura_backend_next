/** In-process cache: one load per key per ttl, shared by concurrent callers. Failed loads are not cached. */
export class TtlMemo {
  private readonly m = new Map<string, { at: number; p: Promise<unknown> }>();

  constructor(private readonly max = 200) {}

  get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.m.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.p as Promise<T>;
    if (this.m.size >= this.max) this.m.clear();
    const p = load();
    this.m.set(key, { at: Date.now(), p });
    p.catch(() => {
      if (this.m.get(key)?.p === p) this.m.delete(key);
    });
    return p;
  }
}
