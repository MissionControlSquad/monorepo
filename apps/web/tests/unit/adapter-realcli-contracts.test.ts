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
