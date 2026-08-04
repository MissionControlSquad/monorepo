/**
 * Plugin event bus + stream bus (parity #108 / #126). PURE in-process primitives — no I/O, no infra.
 * Plugins and the host exchange events through a typed pub/sub `EventBus`; ordered, replayable topic
 * streams go through `StreamBus`. A distributed transport (cross-process/worker) can wrap these later;
 * the semantics here are the contract.
 */

export type BusHandler<T> = (payload: T) => void;

/**
 * Typed in-process pub/sub. Handlers on a topic fire synchronously in subscription order. A throwing
 * handler never blocks the others (errors are collected and rethrown as an AggregateError after all
 * handlers run), so one bad subscriber can't silence the rest.
 */
export class EventBus<Events extends Record<string, unknown> = Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<BusHandler<unknown>>>();

  /** Subscribe to a topic. Returns an unsubscribe function. */
  on<K extends keyof Events>(topic: K, handler: BusHandler<Events[K]>): () => void {
    let set = this.handlers.get(topic);
    if (!set) {
      set = new Set();
      this.handlers.set(topic, set);
    }
    set.add(handler as BusHandler<unknown>);
    return () => {
      this.handlers.get(topic)?.delete(handler as BusHandler<unknown>);
    };
  }

  /** Subscribe for a single delivery, then auto-unsubscribe. */
  once<K extends keyof Events>(topic: K, handler: BusHandler<Events[K]>): () => void {
    const off = this.on(topic, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  /** Publish to a topic. Returns the number of handlers invoked. */
  emit<K extends keyof Events>(topic: K, payload: Events[K]): number {
    const set = this.handlers.get(topic);
    if (!set || set.size === 0) return 0;
    const errors: unknown[] = [];
    // Snapshot so a handler that (un)subscribes mid-emit doesn't change this round.
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      const err = new Error(`${errors.length} bus handlers threw`);
      (err as Error & { errors?: unknown[] }).errors = errors;
      throw err;
    }
    return set.size;
  }

  /** Handler count for a topic (0 if none). */
  listenerCount<K extends keyof Events>(topic: K): number {
    return this.handlers.get(topic)?.size ?? 0;
  }

  /** Drop all handlers (all topics, or one). */
  clear(topic?: keyof Events): void {
    if (topic === undefined) this.handlers.clear();
    else this.handlers.delete(topic);
  }
}

export interface StreamEntry<T> {
  seq: number; // monotonic, 1-based, per topic
  payload: T;
}

/**
 * An ordered, replayable per-topic stream. Appends get a monotonic seq; a subscriber can replay from a
 * seq (catch-up) and then receive live appends. Bounded by `maxPerTopic` (oldest entries drop, but seq
 * keeps advancing) so an unbounded producer can't grow memory without limit.
 */
export class StreamBus<T = unknown> {
  private streams = new Map<string, StreamEntry<T>[]>();
  private seqs = new Map<string, number>();
  private subscribers = new Map<string, Set<BusHandler<StreamEntry<T>>>>();

  constructor(private readonly maxPerTopic = 1000) {}

  /** Append to a topic, returning the assigned entry. */
  append(topic: string, payload: T): StreamEntry<T> {
    const seq = (this.seqs.get(topic) ?? 0) + 1;
    this.seqs.set(topic, seq);
    const entry: StreamEntry<T> = { seq, payload };
    let buf = this.streams.get(topic);
    if (!buf) {
      buf = [];
      this.streams.set(topic, buf);
    }
    buf.push(entry);
    if (buf.length > this.maxPerTopic) buf.splice(0, buf.length - this.maxPerTopic);
    for (const sub of [...(this.subscribers.get(topic) ?? [])]) sub(entry);
    return entry;
  }

  /** Buffered entries for a topic with seq > `afterSeq` (default: everything retained). */
  replay(topic: string, afterSeq = 0): StreamEntry<T>[] {
    return (this.streams.get(topic) ?? []).filter((e) => e.seq > afterSeq);
  }

  /**
   * Subscribe to live appends on a topic. When `replayFrom` is given, buffered entries after that seq
   * are delivered synchronously first (catch-up), then live entries follow. Returns an unsubscribe fn.
   */
  subscribe(
    topic: string,
    handler: BusHandler<StreamEntry<T>>,
    replayFrom?: number,
  ): () => void {
    if (replayFrom !== undefined) for (const e of this.replay(topic, replayFrom)) handler(e);
    let set = this.subscribers.get(topic);
    if (!set) {
      set = new Set();
      this.subscribers.set(topic, set);
    }
    set.add(handler);
    return () => {
      this.subscribers.get(topic)?.delete(handler);
    };
  }

  /** Latest assigned seq for a topic (0 if none). */
  latestSeq(topic: string): number {
    return this.seqs.get(topic) ?? 0;
  }
}
