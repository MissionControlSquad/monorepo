import { describe, it, expect } from "vitest";
import { getAdapter, type AdapterContext, type SpawnInvocation } from "@agentcenter/utils";

// These contracts were confirmed against the REAL `claude` and `codex` CLIs on a live machine and are
// pinned here so a regression in the `build()` argv or the empty-output robustness fails loudly. The
// exact flags matter: e.g. `claude --print` ALONE emits plain text and the JSONL execute() path never
// activates — the stream-json/--verbose flags are what make the structured-result contract work.

const BASE: AdapterContext = { taskId: "t1", workspaceDir: "/tmp/x", prompt: "PING", model: null };
const WITH_MODEL: AdapterContext = { ...BASE, model: "some-model" };

/** build() returns a spawn invocation for every CLI adapter here — narrow + return its argv. */
function argvOf(key: string, ctx: AdapterContext): string[] {
  const inv = getAdapter(key)!.build(ctx);
  expect(inv.mode, `${key} mode`).toBe("spawn");
  return (inv as SpawnInvocation).argv;
}

describe("real-CLI build() argv contracts", () => {
  it("claude: exact stream-json argv; --model inserted before the prompt when set", () => {
    expect(argvOf("claude", BASE)).toEqual([
      "claude",
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      "PING",
    ]);
    expect(argvOf("claude", WITH_MODEL)).toEqual([
      "claude",
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      "--model",
      "some-model",
      "PING",
    ]);
  });

  it("codex: exact `codex exec --json` argv; -m inserted before the prompt when set", () => {
    expect(argvOf("codex", BASE)).toEqual(["codex", "exec", "--json", "PING"]);
    expect(argvOf("codex", WITH_MODEL)).toEqual([
      "codex",
      "exec",
      "--json",
      "-m",
      "some-model",
      "PING",
    ]);
  });

  it("gemini: exact stream-json argv as written in source; -m appears only when a model is set", () => {
    // Source form: gemini [-m <model>] -o stream-json -p <prompt>. The model flag is `-m` (not
    // `--model`) and is inserted immediately after the executable; the prompt is always the last arg.
    expect(argvOf("gemini", BASE)).toEqual(["gemini", "-o", "stream-json", "-p", "PING"]);
    expect(argvOf("gemini", WITH_MODEL)).toEqual([
      "gemini",
      "-m",
      "some-model",
      "-o",
      "stream-json",
      "-p",
      "PING",
    ]);
    // -m/some-model present only in the model variant.
    expect(argvOf("gemini", BASE)).not.toContain("-m");
  });

  it("all three set mode:spawn and put the assembled brief (prompt) as the LAST argv element", () => {
    for (const key of ["claude", "codex", "gemini"] as const) {
      const inv = getAdapter(key)!.build(BASE);
      expect(inv.mode, key).toBe("spawn");
      const argv = (inv as SpawnInvocation).argv;
      expect(argv[argv.length - 1], key).toBe("PING");
    }
  });
});

describe("empty-output / no-auth robustness (runtime exits 0 with empty stdout)", () => {
  // The real no-auth case: the CLI writes a stdin prompt to stderr and exits 0 with NO JSONL on stdout.
  // The derivation must not crash on the empty JSONL and must report a clean, empty success.
  const NO_AUTH = {
    stdout: "",
    stderr: "Reading additional input from stdin...",
    exitCode: 0,
    timedOut: false,
  } as const;

  for (const key of ["claude", "codex", "gemini"] as const) {
    it(`${key}: empty stdout + exit 0 → success/completed with an empty transcript (no throw)`, () => {
      const adapter = getAdapter(key)!;
      const result = adapter.execute!({ ...NO_AUTH });
      expect(result.status).toBe("success");
      expect(result.exitReason).toBe("completed");
      expect(result.transcript ?? []).toHaveLength(0);
    });

    it(`${key}: non-zero exit + empty stdout → error/error`, () => {
      const result = getAdapter(key)!.execute!({
        stdout: "",
        stderr: "",
        exitCode: 1,
        timedOut: false,
      });
      expect(result.status).toBe("error");
      expect(result.exitReason).toBe("error");
    });
  }
});

// The five previously build-only shims, now verified against their REAL CLIs (installed + `--help`, plus
// live JSON runs for opencode and Cursor's official headless docs). These pins fail loudly if the argv or
// the structured-execute wiring regresses. Hermes has no installable CLI, so only its (unverified) argv
// shape is pinned and it deliberately stays on the plain-blob path.
describe("real-CLI build() argv contracts — newly-verified local runtimes", () => {
  it("cursor: `-p --output-format stream-json --force`; --model before the prompt when set", () => {
    // Verified via `cursor-agent --help` + Cursor headless docs — stream-json is Claude-Code-style.
    expect(argvOf("cursor", BASE)).toEqual([
      "cursor-agent",
      "-p",
      "--output-format",
      "stream-json",
      "--force",
      "PING",
    ]);
    expect(argvOf("cursor", WITH_MODEL)).toEqual([
      "cursor-agent",
      "-p",
      "--output-format",
      "stream-json",
      "--force",
      "--model",
      "some-model",
      "PING",
    ]);
  });

  it("grok: model flag (`-m`) precedes `-p` so -p does not swallow it; plain-text blob path", () => {
    // Verified via `grok --help` (v1.0.1): headless is `-p <prompt>`, no JSON/stream flag exists.
    expect(argvOf("grok", BASE)).toEqual(["grok", "-p", "PING"]);
    expect(argvOf("grok", WITH_MODEL)).toEqual(["grok", "-m", "some-model", "-p", "PING"]);
    // grok emits only plain text → no structured execute() (stays on the blob path).
    expect(getAdapter("grok")!.execute).toBeUndefined();
  });

  it("opencode: `run --format json`; --model before the positional message", () => {
    // Verified via `opencode run --help` + a live `--format json` run (v1.18).
    expect(argvOf("opencode", BASE)).toEqual(["opencode", "run", "--format", "json", "PING"]);
    expect(argvOf("opencode", WITH_MODEL)).toEqual([
      "opencode",
      "run",
      "--format",
      "json",
      "--model",
      "some-model",
      "PING",
    ]);
  });

  it("pi: `-p --mode json`; --model before the positional prompt", () => {
    // Verified via `pi --help` + bundled docs/json.md + pi-ai types (v0.73).
    expect(argvOf("pi", BASE)).toEqual(["pi", "-p", "--mode", "json", "PING"]);
    expect(argvOf("pi", WITH_MODEL)).toEqual([
      "pi",
      "-p",
      "--mode",
      "json",
      "--model",
      "some-model",
      "PING",
    ]);
  });

  it("hermes: UNVERIFIED argv shape (no installable CLI) — stays on the blob path", () => {
    expect(argvOf("hermes", BASE)).toEqual(["hermes", "run", "PING"]);
    expect(getAdapter("hermes")!.execute).toBeUndefined();
  });

  it("all four verified CLIs put the assembled brief (prompt) LAST", () => {
    for (const key of ["cursor", "grok", "opencode", "pi"] as const) {
      const argv = argvOf(key, BASE);
      expect(argv[argv.length - 1], key).toBe("PING");
    }
  });
});

describe("opencode execute() derives transcript + usage from live JSON events", () => {
  it("maps text/tool_use to turns and sums step_finish tokens (input + cache.write)", () => {
    // Captured verbatim shape from a live `opencode run --format json` invocation (opencode 1.18).
    const stdout = [
      JSON.stringify({ type: "step_start", part: { type: "step-start" } }),
      JSON.stringify({
        type: "tool_use",
        part: {
          type: "tool",
          tool: "bash",
          state: { status: "completed", input: { command: "echo hi" }, output: "hi\n" },
        },
      }),
      JSON.stringify({
        type: "step_finish",
        part: {
          type: "step-finish",
          reason: "tool-calls",
          tokens: { input: 77, output: 44, cache: { write: 3, read: 7808 } },
        },
      }),
      JSON.stringify({ type: "text", part: { type: "text", text: "all done" } }),
      JSON.stringify({
        type: "step_finish",
        part: {
          type: "step-finish",
          reason: "stop",
          tokens: { input: 10, output: 2, cache: { write: 0, read: 7808 } },
        },
      }),
    ].join("\n");

    const result = getAdapter("opencode")!.execute!({
      stdout,
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    expect(result.status).toBe("success");
    // tokensIn = (77+3) + (10+0) = 90; tokensOut = 44 + 2 = 46; opencode JSON has no model → null.
    expect(result.usage).toEqual({ tokensIn: 90, tokensOut: 46, model: null });
    const kinds = (result.transcript ?? []).map((e) => e.kind);
    expect(kinds).toContain("tool_call");
    expect(kinds).toContain("tool_result");
    expect(kinds).toContain("assistant");
  });
});

describe("pi execute() derives transcript + usage from message_end events", () => {
  it("extracts model + usage from the assistant message_end and maps content to turns", () => {
    // Shape per pi's bundled docs/json.md + pi-ai AssistantMessage type (v0.73).
    const stdout = [
      JSON.stringify({ type: "session", version: 3, id: "u1" }),
      JSON.stringify({ type: "agent_start" }),
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          model: "claude-sonnet-5",
          stopReason: "stop",
          content: [{ type: "text", text: "hello from pi" }],
          usage: { input: 30, output: 8, cacheWrite: 2, cacheRead: 100, totalTokens: 140 },
        },
      }),
    ].join("\n");

    const result = getAdapter("pi")!.execute!({ stdout, stderr: "", exitCode: 0, timedOut: false });
    expect(result.status).toBe("success");
    // tokensIn = input(30) + cacheWrite(2) = 32; tokensOut = 8; model from the assistant message.
    expect(result.usage).toEqual({ tokensIn: 32, tokensOut: 8, model: "claude-sonnet-5" });
    expect(result.transcript?.[0]).toMatchObject({ kind: "assistant", text: "hello from pi" });
  });
});

describe("codex execute() is wired to codex-specific outcome extraction", () => {
  it("extracts model from thread.started and tokens from turn.completed usage", () => {
    // Minimal realistic codex JSONL: the session envelope (model) + the terminal usage envelope. codex
    // `input_tokens` already EXCLUDES cache reads, so cached_input_tokens must NOT add to tokensIn.
    const stdout = [
      JSON.stringify({ type: "thread.started", thread_id: "thread_1", model: "gpt-5-codex" }),
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 42, cached_input_tokens: 5, output_tokens: 7 },
      }),
    ].join("\n");

    const result = getAdapter("codex")!.execute!({
      stdout,
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });

    expect(result.status).toBe("success");
    expect(result.usage).toEqual({ tokensIn: 42, tokensOut: 7, model: "gpt-5-codex" });
  });
});
