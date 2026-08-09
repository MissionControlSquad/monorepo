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
  it("claude/codex/gemini adapters own parseLine + execute; aliases resolve to them", () => {
    for (const key of ["claude", "codex", "gemini"] as const) {
      const adapter = getAdapter(key);
      expect(adapter, key).toBeDefined();
      expect(typeof adapter?.parseLine, key).toBe("function");
      expect(typeof adapter?.execute, key).toBe("function");
    }
    // The seeded DB row spellings resolve to the same modules (with the contract members).
    expect(typeof getAdapter("claude-local")?.execute).toBe("function");
    expect(typeof getAdapter("codex-local")?.execute).toBe("function");
    expect(typeof getAdapter("gemini-local")?.execute).toBe("function");
  });

  it("blob-only adapters stay on the build() path (no execute/parseLine)", () => {
    const openclaw = getAdapter("openclaw");
    expect(openclaw).toBeDefined();
    expect(openclaw?.parseLine).toBeUndefined();
    expect(openclaw?.execute).toBeUndefined();
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

  it("a SUCCESSFUL run with a benign rate_limit_event telemetry line stays success (real-CLI regression)", () => {
    // Claude emits a `rate_limit_event` line on a normal, successful run - it is telemetry, NOT a
    // failure. Verified against real `claude --print --output-format stream-json` output.
    const rateLimit = JSON.stringify({
      type: "rate_limit_event",
      rate_limit: { status: "allowed", resetsAt: "2026-08-09T00:00:00Z" },
    });
    const result = claude.execute!({
      stdout: [CLAUDE_INIT, CLAUDE_ASSISTANT, rateLimit, CLAUDE_RESULT].join("\n"),
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    expect(result.status).toBe("success");
    expect(result.exitReason).toBe("completed");
    expect(result.errorFamily).toBeUndefined();
    expect(result.usage?.tokensOut).toBe(45);
  });

  it("renderAdapterTranscript turns a parsed transcript into readable task text (not JSONL)", async () => {
    const { renderAdapterTranscript } = await import("@agentcenter/utils");
    const result = claude.execute!({
      stdout: CLAUDE_STDOUT,
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    const text = renderAdapterTranscript(result.transcript ?? []);
    expect(text).toContain("hello"); // the assistant turn
    expect(text).not.toContain("{"); // no raw JSON
    expect(renderAdapterTranscript([])).toBe("");
  });

  it("a rate-limit that actually FAILS the run keeps errorFamily transient_upstream", () => {
    const result = claude.execute!({
      stdout: JSON.stringify({ type: "result", subtype: "error", is_error: true }),
      stderr: "Error: 429 rate limit exceeded, please try again later",
      exitCode: 1,
      timedOut: false,
    });
    expect(result.status).toBe("error");
    expect(result.errorFamily).toBe("transient_upstream");
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
    const openclaw = getAdapter("openclaw")!;
    const result = deriveAdapterExecutionResult(openclaw, {
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

// ─── Codex (`codex exec` JSONL protocol) ─────────────────────────────────────
// Real sample lines ported from paperclip codex-local `parse.ts`/`parse.test.ts`.
const CODEX_THREAD = JSON.stringify({
  type: "thread.started",
  thread_id: "thread_123",
  model: "gpt-5-codex",
});
const CODEX_REASONING = JSON.stringify({
  type: "item.completed",
  item: { type: "reasoning", text: "Checking the heartbeat procedure" },
});
const CODEX_CMD_STARTED = JSON.stringify({
  type: "item.started",
  item: { type: "command_execution", id: "c1", command: "ls -la" },
});
const CODEX_CMD_DONE = JSON.stringify({
  type: "item.completed",
  item: {
    type: "command_execution",
    id: "c1",
    command: "ls -la",
    status: "completed",
    exit_code: 0,
    aggregated_output: "file.txt\n",
  },
});
const CODEX_AGENT_MSG = JSON.stringify({
  type: "item.completed",
  item: { type: "agent_message", text: "Fixed the issue and verified the tests pass." },
});
const CODEX_TURN_DONE = JSON.stringify({
  type: "turn.completed",
  usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 4 },
});
const CODEX_STDOUT = [
  CODEX_THREAD,
  CODEX_REASONING,
  CODEX_CMD_STARTED,
  CODEX_CMD_DONE,
  CODEX_AGENT_MSG,
  CODEX_TURN_DONE,
].join("\n");

describe("codex parseLine + execute (JSONL protocol)", () => {
  const codex = getAdapter("codex")!;

  it("maps item events to thinking / tool_call / tool_result / assistant turns", () => {
    expect(stripTs(codex.parseLine!(CODEX_REASONING, TS) ?? [])).toEqual([
      { kind: "thinking", text: "Checking the heartbeat procedure" },
    ]);
    expect(stripTs(codex.parseLine!(CODEX_CMD_STARTED, TS) ?? [])).toEqual([
      { kind: "tool_call", tool: "command_execution", args: { command: "ls -la" } },
    ]);
    expect(stripTs(codex.parseLine!(CODEX_CMD_DONE, TS) ?? [])).toEqual([
      { kind: "tool_result", tool: "command_execution", result: "file.txt", isError: false },
    ]);
    expect(stripTs(codex.parseLine!(CODEX_AGENT_MSG, TS) ?? [])).toEqual([
      { kind: "assistant", text: "Fixed the issue and verified the tests pass." },
    ]);
  });

  it("returns null for protocol envelopes and non-JSON lines", () => {
    expect(codex.parseLine!(CODEX_THREAD, TS)).toBeNull();
    expect(codex.parseLine!(CODEX_TURN_DONE, TS)).toBeNull();
    expect(codex.parseLine!("plain log line", TS)).toBeNull();
    expect(codex.parseLine!("", TS)).toBeNull();
  });

  it("marks a failed command (nonzero exit) as an error tool_result", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: {
        type: "command_execution",
        command: "false",
        status: "failed",
        exit_code: 1,
        aggregated_output: "boom",
      },
    });
    expect(stripTs(codex.parseLine!(line, TS) ?? [])).toEqual([
      { kind: "tool_result", tool: "command_execution", result: "boom", isError: true },
    ]);
  });

  it("derives transcript + usage + clean exit from a successful run", () => {
    const result = codex.execute!({
      stdout: CODEX_STDOUT,
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    expect(result.status).toBe("success");
    expect(result.exitReason).toBe("completed");
    // codex input_tokens excludes cache reads → 10 in, 4 out; model from thread.started.
    expect(result.usage).toEqual({ tokensIn: 10, tokensOut: 4, model: "gpt-5-codex" });
    expect(stripTs(result.transcript ?? [])).toEqual([
      { kind: "thinking", text: "Checking the heartbeat procedure" },
      { kind: "tool_call", tool: "command_execution", args: { command: "ls -la" } },
      { kind: "tool_result", tool: "command_execution", result: "file.txt", isError: false },
      { kind: "assistant", text: "Fixed the issue and verified the tests pass." },
    ]);
  });

  it("treats a turn.failed protocol event as an errored run", () => {
    const stdout = [
      CODEX_THREAD,
      JSON.stringify({ type: "turn.failed", error: { message: "the model rejected the request" } }),
    ].join("\n");
    const result = codex.execute!({ stdout, stderr: "", exitCode: 0, timedOut: false });
    expect(result.status).toBe("error");
    expect(result.exitReason).toBe("error");
  });

  it("classifies a codex usage-limit failure as provider_quota", () => {
    const result = codex.execute!({
      stdout: "",
      stderr: "You've hit your usage limit for this model. Try again at 3pm.",
      exitCode: 1,
      timedOut: false,
    });
    expect(result.errorFamily).toBe("provider_quota");
  });
});

// ─── Gemini CLI (stream-json) ────────────────────────────────────────────────
// Real sample lines ported from paperclip gemini-local `parse.ts`/`parse.test.ts`.
const GEMINI_INIT = JSON.stringify({
  type: "init",
  session_id: "session-abc",
  model: "gemini-3-pro",
});
const GEMINI_USER = JSON.stringify({
  type: "message",
  role: "user",
  content: "Respond with hello.",
});
const GEMINI_ASSISTANT = JSON.stringify({
  type: "message",
  role: "assistant",
  content: "hello.",
  delta: true,
});
const GEMINI_LEGACY_ASSISTANT = JSON.stringify({
  type: "assistant",
  message: { content: [{ type: "output_text", text: "legacy hello" }] },
});
const GEMINI_RESULT = JSON.stringify({
  type: "result",
  status: "success",
  stats: { total_tokens: 9468, input_tokens: 9095, output_tokens: 29, cached: 8132 },
});
const GEMINI_STDOUT = [GEMINI_INIT, GEMINI_USER, GEMINI_ASSISTANT, GEMINI_RESULT].join("\n");

describe("gemini parseLine + execute (stream-json)", () => {
  const gemini = getAdapter("gemini")!;

  it("maps assistant message events (v0.38 + legacy) to assistant turns", () => {
    expect(stripTs(gemini.parseLine!(GEMINI_ASSISTANT, TS) ?? [])).toEqual([
      { kind: "assistant", text: "hello." },
    ]);
    expect(stripTs(gemini.parseLine!(GEMINI_LEGACY_ASSISTANT, TS) ?? [])).toEqual([
      { kind: "assistant", text: "legacy hello" },
    ]);
  });

  it("collects multi-part structured assistant content", () => {
    const line = JSON.stringify({
      type: "message",
      role: "assistant",
      content: {
        content: [
          { type: "text", text: "first part" },
          { type: "text", text: "second part" },
        ],
      },
    });
    expect(stripTs(gemini.parseLine!(line, TS) ?? [])).toEqual([
      { kind: "assistant", text: "first part" },
      { kind: "assistant", text: "second part" },
    ]);
  });

  it("returns null for user/system messages, result envelopes, and non-JSON", () => {
    expect(gemini.parseLine!(GEMINI_USER, TS)).toBeNull();
    expect(gemini.parseLine!(GEMINI_INIT, TS)).toBeNull();
    expect(gemini.parseLine!(GEMINI_RESULT, TS)).toBeNull();
    expect(gemini.parseLine!("plain log line", TS)).toBeNull();
    expect(gemini.parseLine!("", TS)).toBeNull();
  });

  it("derives transcript + usage (from stats) + clean exit from a successful run", () => {
    const result = gemini.execute!({
      stdout: GEMINI_STDOUT,
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    expect(result.status).toBe("success");
    expect(result.exitReason).toBe("completed");
    // stats.input_tokens / output_tokens (cached excluded); model from the init envelope.
    expect(result.usage).toEqual({ tokensIn: 9095, tokensOut: 29, model: "gemini-3-pro" });
    expect(stripTs(result.transcript ?? [])).toEqual([{ kind: "assistant", text: "hello." }]);
  });

  it("maps a turn-limit result to exitReason max_turns", () => {
    const stdout = [GEMINI_INIT, JSON.stringify({ type: "result", status: "turn_limit" })].join(
      "\n",
    );
    const result = gemini.execute!({ stdout, stderr: "", exitCode: 0, timedOut: false });
    expect(result.status).toBe("error");
    expect(result.exitReason).toBe("max_turns");
  });

  it("classifies a gemini quota-exhausted failure as provider_quota", () => {
    const result = gemini.execute!({
      stdout: "",
      stderr: "Error: RESOURCE_EXHAUSTED: quota exceeded for this project.",
      exitCode: 1,
      timedOut: false,
    });
    expect(result.errorFamily).toBe("provider_quota");
  });

  it("classifies a gemini auth failure as auth_required", () => {
    const result = gemini.execute!({
      stdout: "",
      stderr: "API key missing. Please run `gemini auth login` first.",
      exitCode: 1,
      timedOut: false,
    });
    expect(result.errorFamily).toBe("auth_required");
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
