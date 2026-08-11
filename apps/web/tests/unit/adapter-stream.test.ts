import { describe, it, expect } from "vitest";
import {
  createAdapterTranscriptStream,
  getAdapter,
  type AdapterTranscriptEvent,
} from "@agentcenter/utils";

const TS = 1000;

/** Reference post-hoc parse: exactly what deriveAdapterExecutionResult does over a full stdout blob. */
function postHoc(
  blob: string,
  parseLine: (l: string, ts?: number) => AdapterTranscriptEvent[] | null,
) {
  const out: AdapterTranscriptEvent[] = [];
  for (const raw of blob.split(/\r?\n/)) {
    const events = parseLine(raw, TS);
    if (events) out.push(...events);
  }
  return out;
}

/** Feed a blob through the stream in fixed-size chunks (stress partial-line boundaries), then flush. */
function streamed(
  blob: string,
  parseLine: (l: string, ts?: number) => AdapterTranscriptEvent[] | null,
  chunkSize: number,
) {
  const stream = createAdapterTranscriptStream(parseLine, { ts: TS });
  for (let i = 0; i < blob.length; i += chunkSize) {
    stream.push(blob.slice(i, i + chunkSize));
  }
  stream.flush();
  return stream.events;
}

const CLAUDE_BLOB = [
  JSON.stringify({ type: "system", subtype: "init", model: "claude-opus-4-8" }),
  JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "text", text: "Hello world" }] },
  }),
  JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "bash", input: { cmd: "ls" } }] },
  }),
  JSON.stringify({
    type: "result",
    subtype: "success",
    usage: { input_tokens: 10, output_tokens: 5 },
  }),
].join("\n");

const CODEX_BLOB = [
  JSON.stringify({ type: "thread.started", model: "gpt-x" }),
  JSON.stringify({
    type: "item.completed",
    item: { type: "agent_message", text: "done reasoning" },
  }),
  JSON.stringify({ type: "turn.completed", usage: { input_tokens: 3, output_tokens: 2 } }),
].join("\n");

describe("adapter-stream: incremental transcript == post-hoc blob parse (equivalence)", () => {
  const claudeParse = getAdapter("claude")!.parseLine!.bind(getAdapter("claude")!);
  const codexParse = getAdapter("codex")!.parseLine!.bind(getAdapter("codex")!);

  it("claude stream-json: same events regardless of chunk boundaries", () => {
    const expected = postHoc(CLAUDE_BLOB, claudeParse);
    expect(expected.length).toBe(2); // two assistant/tool turns; system+result are passthrough
    for (const size of [1, 3, 7, 13, 1000]) {
      expect(streamed(CLAUDE_BLOB, claudeParse, size)).toEqual(expected);
    }
  });

  it("codex JSONL: same events regardless of chunk boundaries", () => {
    const expected = postHoc(CODEX_BLOB, codexParse);
    for (const size of [1, 5, 999]) {
      expect(streamed(CODEX_BLOB, codexParse, size)).toEqual(expected);
    }
  });

  it("handles a trailing line with no newline (flush parses it)", () => {
    const noTrailingNl = CLAUDE_BLOB; // no trailing \n
    expect(streamed(noTrailingNl, claudeParse, 4)).toEqual(postHoc(noTrailingNl, claudeParse));
  });

  it("is CRLF-equivalent to LF", () => {
    const crlf = CLAUDE_BLOB.replace(/\n/g, "\r\n");
    expect(streamed(crlf, claudeParse, 6)).toEqual(postHoc(CLAUDE_BLOB, claudeParse));
  });
});

describe("adapter-stream: progressive emission", () => {
  const claudeParse = getAdapter("claude")!.parseLine!.bind(getAdapter("claude")!);

  it("emits a line's events only once its newline arrives; buffers partials", () => {
    const stream = createAdapterTranscriptStream(claudeParse, { ts: TS });
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "turn one" }] },
    });

    // A complete line + newline → emits immediately.
    const first = stream.push(line + "\n");
    expect(first).toEqual([{ kind: "assistant", ts: TS, text: "turn one" }]);

    // A partial line (no newline yet) → nothing emitted, buffered.
    const line2 = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "turn two" }] },
    });
    const half = line2.slice(0, 20);
    expect(stream.push(half)).toEqual([]);

    // The rest + newline → the buffered line now emits.
    const second = stream.push(line2.slice(20) + "\n");
    expect(second).toEqual([{ kind: "assistant", ts: TS, text: "turn two" }]);

    // Accumulated live transcript is progressive (both turns, in order).
    expect(stream.events).toEqual([
      { kind: "assistant", ts: TS, text: "turn one" },
      { kind: "assistant", ts: TS, text: "turn two" },
    ]);
  });

  it("passthrough (system/result) lines emit nothing", () => {
    const stream = createAdapterTranscriptStream(claudeParse, { ts: TS });
    expect(stream.push(JSON.stringify({ type: "system", subtype: "init" }) + "\n")).toEqual([]);
    expect(stream.push(JSON.stringify({ type: "result", subtype: "success" }) + "\n")).toEqual([]);
    expect(stream.events).toEqual([]);
  });
});
