import { describe, it, expect } from "vitest";
import {
  getAdapter,
  classifyErrorFamily,
  defaultLineParser,
  deriveAdapterExecutionResult,
  type AdapterTranscriptEvent,
} from "@agentcenter/utils";

const TS = 1000;

/** Strip the observation timestamp so transcript assertions are stable. */
function stripTs(events: AdapterTranscriptEvent[]) {
  return events.map(({ ts: _ts, ...rest }) => rest);
}

// A realistic Claude `stream-json` transcript: init envelope, an assistant turn (text + tool_use),
// then the terminal result envelope carrying usage.
const CLAUDE_INIT = JSON.stringify({
  type: "system",
  subtype: "init",
  model: "claude-opus-4-8",
  session_id: "sess-1",
});
const CLAUDE_ASSISTANT = JSON.stringify({
  type: "assistant",
  message: {
    content: [
      { type: "text", text: "hello" },
      { type: "tool_use", name: "bash", input: { cmd: "ls" } },
    ],
  },
});
const CLAUDE_RESULT = JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: false,
  model: "claude-opus-4-8",
  usage: { input_tokens: 120, cache_creation_input_tokens: 30, output_tokens: 45 },
});
const CLAUDE_STDOUT = [CLAUDE_INIT, CLAUDE_ASSISTANT, CLAUDE_RESULT].join("\n");

describe("adapter execution contract — registration (back-compat)", () => {
  it("claude adapter owns parseLine + execute; aliases resolve to it", () => {
    const claude = getAdapter("claude");
    expect(claude).toBeDefined();
    expect(typeof claude?.parseLine).toBe("function");
    expect(typeof claude?.execute).toBe("function");
    // The seeded DB row spelling resolves to the same module (with the contract members).
    expect(typeof getAdapter("claude-local")?.execute).toBe("function");
  });

  it("blob-only adapters stay on the build() path (no execute/parseLine)", () => {
    const codex = getAdapter("codex");
    expect(codex).toBeDefined();
    expect(codex?.parseLine).toBeUndefined();
    expect(codex?.execute).toBeUndefined();
  });
});

describe("claude parseLine (per-runtime line parsing)", () => {
  const claude = getAdapter("claude")!;

  it("maps a stream-json assistant line to assistant + tool_call events", () => {
    const out = claude.parseLine!(CLAUDE_ASSISTANT, TS);
    expect(out).toEqual([
      { kind: "assistant", ts: TS, text: "hello" },
      { kind: "tool_call", ts: TS, tool: "bash", args: { cmd: "ls" } },
    ]);
  });

  it("returns null for a non-JSON line (passthrough)", () => {
    expect(claude.parseLine!("not json at all", TS)).toBeNull();
  });

  it("returns null for Claude envelopes that carry no transcript events", () => {
    // init / result envelopes are not transcript turns → null (usage is derived separately).
    expect(claude.parseLine!(CLAUDE_INIT, TS)).toBeNull();
    expect(claude.parseLine!(CLAUDE_RESULT, TS)).toBeNull();
  });

  it("returns null for a blank line", () => {
    expect(claude.parseLine!("", TS)).toBeNull();
  });
});

describe("execute() — structured result derivation", () => {
  const claude = getAdapter("claude")!;

  it("derives transcript + usage + a clean exit reason from a successful run", () => {
    const result = claude.execute!({
      stdout: CLAUDE_STDOUT,
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });

    expect(result.status).toBe("success");
    expect(result.exitReason).toBe("completed");
    expect(result.errorFamily).toBeUndefined();
    // cache-creation tokens (30) count as input → 150 in, 45 out; model from the envelope.
    expect(result.usage).toEqual({ tokensIn: 150, tokensOut: 45, model: "claude-opus-4-8" });
    // init/result envelopes are excluded; only the assistant turn's events remain.
    expect(stripTs(result.transcript ?? [])).toEqual([
      { kind: "assistant", text: "hello" },
      { kind: "tool_call", tool: "bash", args: { cmd: "ls" } },
    ]);
  });

  it("classifies a provider-quota failure (non-zero exit, quota text on stderr)", () => {
    const result = claude.execute!({
      stdout: "",
      stderr: "Error: Claude usage limit reached. Try again later.",
      exitCode: 1,
      timedOut: false,
    });
    expect(result.status).toBe("error");
    expect(result.errorFamily).toBe("provider_quota");
    expect(result.exitReason).toBe("error");
    expect(result.usage).toBeUndefined();
  });

  it("maps a timeout to status/exitReason timeout", () => {
    const result = claude.execute!({
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: true,
    });
    expect(result.status).toBe("timeout");
    expect(result.exitReason).toBe("timeout");
  });

  it("maps a refusal (clean exit) to exitReason refusal", () => {
    const result = claude.execute!({
      stdout: "I'm sorry, but I cannot assist with that request.",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    expect(result.status).toBe("error");
    expect(result.errorFamily).toBe("model_refusal");
    expect(result.exitReason).toBe("refusal");
  });
});

describe("defaultLineParser (fallback for adapters without parseLine)", () => {
  it("keeps unknown/plain lines as raw entries instead of dropping them", () => {
    const out = defaultLineParser("just some log output", TS);
    expect(out).toEqual([{ kind: "raw", ts: TS, text: "just some log output" }]);
  });

  it("returns null for a blank line", () => {
    expect(defaultLineParser("", TS)).toBeNull();
  });

  it("deriveAdapterExecutionResult falls back to the default parser for blob adapters", () => {
    const codex = getAdapter("codex")!;
    const result = deriveAdapterExecutionResult(codex, {
      stdout: "line one\nline two",
      exitCode: 0,
      ts: TS,
    });
    expect(result.status).toBe("success");
    expect(result.exitReason).toBe("completed");
    expect(stripTs(result.transcript ?? [])).toEqual([
      { kind: "raw", text: "line one" },
      { kind: "raw", text: "line two" },
    ]);
  });
});

describe("classifyErrorFamily (pure classifier)", () => {
  it.each([
    ["Claude usage limit reached", "provider_quota"],
    ["rate_limit_error: 429 too many requests", "transient_upstream"],
    ["503 service unavailable, please try again later", "transient_upstream"],
    ["Please run `claude login` to continue", "auth_required"],
    ["Error: model not found for id xyz", "model_not_found"],
    ["The assistant declined to respond", "model_refusal"],
  ])("classifies %j as %s", (text, family) => {
    expect(classifyErrorFamily(text)).toBe(family);
  });

  it("returns null for text matching no known family", () => {
    expect(classifyErrorFamily("everything is fine")).toBeNull();
    expect(classifyErrorFamily("")).toBeNull();
  });
});
