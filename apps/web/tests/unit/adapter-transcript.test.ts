import { describe, it, expect } from "vitest";
import {
  parseLine,
  parseTranscriptChunk,
  redactHomePathUserSegments,
  redactCommandText,
} from "@agentcenter/utils";

const TS = 1000;

describe("parseLine (#F6)", () => {
  it("parses Claude stream-json assistant content blocks", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "hello" },
          { type: "tool_use", name: "bash", input: { cmd: "ls" } },
        ],
      },
    });
    const out = parseLine(line, TS);
    expect(out).toEqual([
      { kind: "assistant", ts: TS, text: "hello" },
      { kind: "tool_call", ts: TS, tool: "bash", args: { cmd: "ls" } },
    ]);
  });

  it("parses thinking blocks", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "thinking", thinking: "hmm" }] },
    });
    expect(parseLine(line, TS)).toEqual([{ kind: "thinking", ts: TS, text: "hmm" }]);
  });

  it("parses flat tool_result + diff events", () => {
    expect(
      parseLine(JSON.stringify({ type: "tool_result", output: "done", is_error: false }), TS),
    ).toEqual([{ kind: "tool_result", ts: TS, tool: undefined, result: "done", isError: false }]);
    expect(parseLine(JSON.stringify({ type: "diff", diff: "--- a\n+++ b" }), TS)[0]).toMatchObject({
      kind: "diff",
    });
  });

  it("unwraps a nested item event (Codex item.completed)", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: { type: "assistant_message", text: "hi" },
    });
    expect(parseLine(line, TS)).toEqual([{ kind: "assistant", ts: TS, text: "hi" }]);
  });

  it("non-JSON → raw; blank → nothing", () => {
    expect(parseLine("plain text log", TS)).toEqual([
      { kind: "raw", ts: TS, text: "plain text log" },
    ]);
    expect(parseLine("   ", TS)).toEqual([]);
  });

  it("redacts home paths and command secrets in emitted text", () => {
    const out = parseLine(
      JSON.stringify({ type: "assistant", text: "ran in /Users/alice/proj with --token abc123" }),
      TS,
    );
    expect(out[0].text).toBe("ran in /Users/<user>/proj with --token <redacted>");
  });

  it("parseTranscriptChunk handles multiple lines in order", () => {
    const chunk =
      JSON.stringify({ type: "assistant", text: "a" }) +
      "\n" +
      JSON.stringify({ type: "assistant", text: "b" });
    expect(parseTranscriptChunk(chunk, TS).map((e) => e.text)).toEqual(["a", "b"]);
  });
});

describe("redaction helpers", () => {
  it("redactHomePathUserSegments handles posix + windows", () => {
    expect(redactHomePathUserSegments("/home/bob/x")).toBe("/home/<user>/x");
    expect(redactHomePathUserSegments("C:\\Users\\bob\\x")).toBe("C:\\Users\\<user>\\x");
  });
  it("redactCommandText masks bearer + KEY=", () => {
    expect(redactCommandText("Authorization: Bearer sk-abc")).toBe(
      "Authorization: Bearer <redacted>",
    );
    expect(redactCommandText("OPENAI_API_KEY=sk-xyz")).toBe("OPENAI_API_KEY=<redacted>");
  });
});
