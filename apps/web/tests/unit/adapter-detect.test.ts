import { describe, it, expect, afterEach } from "vitest";
import {
  parseDetectedModels,
  detectModelsForKey,
  MODEL_PROBE_SPECS,
  setRuntimeModelProbe,
  resolveAdapterModels,
  getAdapter,
  type RuntimeModelProbe,
} from "@agentcenter/utils";

afterEach(() => setRuntimeModelProbe(null)); // never leak an injected probe across tests

describe("parseDetectedModels (pure)", () => {
  it("extracts versioned model-id tokens, dedups, lowercases, preserves order", () => {
    const help =
      "Models: claude-opus-4-8, claude-sonnet-5. Also CLAUDE-OPUS-4-8 again and plain 'claude'.";
    expect(parseDetectedModels(help, MODEL_PROBE_SPECS.claude.pattern)).toEqual([
      "claude-opus-4-8",
      "claude-sonnet-5",
    ]);
  });

  it("requires a digit → drops bare structural words like 'codex'/'claude'", () => {
    expect(
      parseDetectedModels("run codex to start; use claude", MODEL_PROBE_SPECS.codex.pattern),
    ).toEqual([]);
    expect(
      parseDetectedModels("gpt-4.1, o3-mini and codex-mini-2", MODEL_PROBE_SPECS.codex.pattern),
    ).toEqual(["gpt-4.1", "o3-mini", "codex-mini-2"]);
  });

  it("empty / no-match output → []", () => {
    expect(parseDetectedModels("", MODEL_PROBE_SPECS.gemini.pattern)).toEqual([]);
    expect(parseDetectedModels("no models here", MODEL_PROBE_SPECS.gemini.pattern)).toEqual([]);
  });
});

describe("detectModelsForKey (injected probe)", () => {
  const probeWith =
    (output: string, installed = true): RuntimeModelProbe =>
    async () => ({
      installed,
      output,
    });

  it("returns live models when the CLI is present", async () => {
    setRuntimeModelProbe(probeWith("available: gemini-3-pro, gemini-3-flash"));
    expect(await detectModelsForKey("gemini")).toEqual(["gemini-3-pro", "gemini-3-flash"]);
  });

  it("returns [] when the CLI is absent", async () => {
    setRuntimeModelProbe(probeWith("gemini-3-pro", /* installed */ false));
    expect(await detectModelsForKey("gemini")).toEqual([]);
  });

  it("returns [] (never throws) when the probe throws", async () => {
    setRuntimeModelProbe(async () => {
      throw new Error("spawn failed");
    });
    expect(await detectModelsForKey("claude")).toEqual([]);
  });

  it("returns [] when no probe is registered (pure package default)", async () => {
    setRuntimeModelProbe(null);
    expect(await detectModelsForKey("claude")).toEqual([]);
  });
});

describe("resolveAdapterModels merge = curated ∪ live for claude/codex/gemini", () => {
  it("claude: live-detected models union the curated list (live first, deduped)", async () => {
    // Probe returns one NEW live model + one already-curated id → union dedups the overlap.
    setRuntimeModelProbe(async () => ({
      installed: true,
      output: "claude-opus-4-9 and existing claude-opus-4-8",
    }));
    const models = await resolveAdapterModels(getAdapter("claude")!);
    expect(models).toContain("claude-opus-4-9"); // live contributed
    expect(models).toContain("claude-sonnet-5"); // curated preserved
    // No duplicate of the overlapping id.
    expect(models.filter((m) => m === "claude-opus-4-8")).toHaveLength(1);
  });

  it("falls back to curated when the CLI is absent (probe reports not installed)", async () => {
    setRuntimeModelProbe(async () => ({ installed: false, output: "" }));
    expect(await resolveAdapterModels(getAdapter("codex")!)).toEqual(getAdapter("codex")!.models);
    expect(await resolveAdapterModels(getAdapter("gemini")!)).toEqual(getAdapter("gemini")!.models);
  });

  it("with no probe registered, the three adapters resolve to their curated lists", async () => {
    setRuntimeModelProbe(null);
    for (const key of ["claude", "codex", "gemini"] as const) {
      expect(await resolveAdapterModels(getAdapter(key)!)).toEqual(getAdapter(key)!.models);
    }
  });
});
