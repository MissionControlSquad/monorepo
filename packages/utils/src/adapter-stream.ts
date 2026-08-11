/**
 * Stateful, PURE streaming transcript parser (§3 adapters — LIVE-streamed transcript).
 *
 * Today an adapter's typed transcript is derived POST-HOC: the whole run's stdout blob is captured,
 * then split on newlines and fed to the adapter's `parseLine` after the run finishes (see
 * `deriveAdapterExecutionResult`). That means a long run shows nothing until it completes.
 *
 * This helper turns that same parse INCREMENTAL: as raw stdout chunks arrive during the run (the
 * `onLog` path), feed them in and it emits the transcript events for every COMPLETE line seen so far,
 * buffering any trailing partial line until the rest of it arrives. It is a thin, allocation-light
 * wrapper around the adapter's own `parseLine`, so — by construction — feeding the exact same bytes in
 * any chunking and then `flush()`-ing yields the SAME event sequence as the post-hoc blob parse. That
 * equivalence is what lets the control plane stream a live transcript while still trusting the post-hoc
 * derivation as the authoritative usage/outcome result.
 *
 * Pure + runtime-neutral (no I/O): fixture-testable and shared by the control plane and the runner.
 */
import type { AdapterTranscriptEvent } from "./adapters";

/** A per-runtime line parser — the shape of `Adapter.parseLine` (already bound to its adapter). */
export type StreamLineParser = (
  line: string,
  ts?: number,
) => AdapterTranscriptEvent[] | null;

export interface AdapterTranscriptStream {
  /**
   * Feed the next raw stdout chunk. Splits on newlines, parses every COMPLETE line, and returns just
   * the events newly emitted by this chunk (empty when the chunk only extended a partial line). The
   * trailing partial line (no newline yet) is buffered for the next `push`/`flush`.
   */
  push(chunk: string): AdapterTranscriptEvent[];
  /** Parse the final buffered partial line (a run whose last line had no trailing newline). */
  flush(): AdapterTranscriptEvent[];
  /** Every event emitted so far (push + flush), in order — the full live transcript. */
  readonly events: AdapterTranscriptEvent[];
}

/**
 * Build a stateful streaming parser around an adapter's `parseLine`. `ts` is stamped onto every emitted
 * event (default: now) — pass a fixed value to make the stream byte-for-byte comparable to a post-hoc
 * parse of the same blob with the same `ts`.
 */
export function createAdapterTranscriptStream(
  parseLine: StreamLineParser,
  opts: { ts?: number } = {},
): AdapterTranscriptStream {
  const ts = opts.ts ?? Date.now();
  let buffer = "";
  const all: AdapterTranscriptEvent[] = [];

  function feed(rawLine: string): AdapterTranscriptEvent[] {
    // Strip a trailing CR so CRLF streams parse identically to the LF-split post-hoc path (the
    // per-runtime parsers also trim, so this only guarantees exact equivalence, never changes events).
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const events = parseLine(line, ts);
    if (events && events.length) {
      all.push(...events);
      return events;
    }
    return [];
  }

  return {
    push(chunk: string): AdapterTranscriptEvent[] {
      buffer += chunk;
      const out: AdapterTranscriptEvent[] = [];
      let idx = buffer.indexOf("\n");
      while (idx !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        out.push(...feed(line));
        idx = buffer.indexOf("\n");
      }
      return out;
    },
    flush(): AdapterTranscriptEvent[] {
      if (buffer.length === 0) return [];
      const line = buffer;
      buffer = "";
      return feed(line);
    },
    get events(): AdapterTranscriptEvent[] {
      return all;
    },
  };
}
