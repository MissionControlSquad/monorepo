/**
 * Delivery de-duplication with optional disk persistence.
 *
 * The bridge acks every mc.deliver_task but only RUNS an agent session once per deliveryId. Without
 * persistence, the dedup set is in-memory only — so if the plugin process restarts, a task that MC
 * re-drains on the next reconnect (still delivered=false server-side because the ack was lost) would
 * run a SECOND time. Persisting the recent deliveryIds across restarts closes that double-run window.
 *
 * FIFO-capped at `limit`; when a `path` is given, the capped list is written on each add and reloaded
 * on construction. All fs is injectable so it can be unit-tested without touching a real disk.
 */
export interface DedupFs {
  existsSync(path: string): boolean;
  readFileSync(path: string, enc: "utf8"): string;
  writeFileSync(path: string, data: string): void;
  mkdirSync(path: string, opts: { recursive: true }): void;
}

export class DeliveryDedup {
  private order: string[] = []; // insertion order, oldest first
  private set = new Set<string>();

  constructor(
    private readonly limit: number,
    private readonly path?: string,
    private readonly fs?: DedupFs,
  ) {
    if (this.path && this.fs?.existsSync(this.path)) {
      try {
        const parsed = JSON.parse(this.fs.readFileSync(this.path, "utf8"));
        if (Array.isArray(parsed)) {
          this.order = parsed.filter((x): x is string => typeof x === "string").slice(-limit);
          this.set = new Set(this.order);
        }
      } catch {
        // Corrupt state file — start fresh rather than crash the plugin.
      }
    }
  }

  has(id: string): boolean {
    return this.set.has(id);
  }

  /** Record a deliveryId as handled. No-op if already known. Persists when a path is configured. */
  add(id: string): void {
    if (this.set.has(id)) return;
    this.order.push(id);
    this.set.add(id);
    while (this.order.length > this.limit) {
      const oldest = this.order.shift();
      if (oldest !== undefined) this.set.delete(oldest);
    }
    this.persist();
  }

  get size(): number {
    return this.set.size;
  }

  private persist(): void {
    if (!this.path || !this.fs) return;
    try {
      const dir = this.path.replace(/[/\\][^/\\]*$/, "");
      if (dir && dir !== this.path) this.fs.mkdirSync(dir, { recursive: true });
      this.fs.writeFileSync(this.path, JSON.stringify(this.order));
    } catch {
      // Persistence is best-effort; a write failure must not break delivery handling.
    }
  }
}

/**
 * Pure keepalive-liveness decision: given whether the previous ping is still unanswered and how many
 * pings have gone unanswered in a row, decide whether the socket is stale and should be force-closed.
 * Extracted so the ping loop's reconnect trigger is unit-testable without timers/sockets.
 */
export function shouldForceReconnect(missedPongs: number, maxMissed: number): boolean {
  return missedPongs >= maxMissed;
}
