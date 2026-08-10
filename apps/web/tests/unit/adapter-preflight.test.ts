import { describe, it, expect, vi, beforeEach } from "vitest";
import { summarizePreflight, type AdapterPreflightCheck } from "@agentcenter/utils";

// Mock the shared runtime probe so no real CLI is spawned; the service's shaping logic runs for real.
const probeMock = vi.fn();
vi.mock("../../src/server/services/ai-runtime-detect", () => ({
  probeRuntimeBin: (bin: string, args: string[]) => probeMock(bin, args),
}));

import { adapterPreflight } from "../../src/server/services/adapter-preflight";

describe("summarizePreflight (pure result shaping)", () => {
  it("is ok only when every check passes", () => {
    const checks: AdapterPreflightCheck[] = [
      { name: "a", ok: true },
      { name: "b", ok: true },
    ];
    expect(summarizePreflight(checks)).toEqual({ ok: true, checks });
  });

  it("is not ok when any check fails, and passes errorFamily through", () => {
    const checks: AdapterPreflightCheck[] = [
      { name: "a", ok: true },
      { name: "b", ok: false, detail: "nope" },
    ];
    const res = summarizePreflight(checks, "auth_required");
    expect(res.ok).toBe(false);
    expect(res.errorFamily).toBe("auth_required");
    expect(res.checks).toBe(checks);
  });

  it("is not ok for an empty check list (nothing was verified)", () => {
    expect(summarizePreflight([])).toEqual({ ok: false, checks: [] });
  });

  it("omits errorFamily when none is supplied", () => {
    expect(summarizePreflight([{ name: "a", ok: true }])).not.toHaveProperty("errorFamily");
  });
});

describe("adapterPreflight service", () => {
  beforeEach(() => probeMock.mockReset());

  it("passes when the runtime CLI is installed and reachable (claude)", async () => {
    probeMock.mockResolvedValue({ installed: true, version: "1.2.3", output: "claude 1.2.3" });
    const res = await adapterPreflight("claude");
    expect(probeMock).toHaveBeenCalledWith("claude", ["--version"]);
    expect(res.ok).toBe(true);
    expect(res.checks.map((c) => c.name)).toEqual(["CLI installed", "Reachable", "Authenticated"]);
    expect(res.checks.every((c) => c.ok)).toBe(true);
    expect(res.checks[0].detail).toContain("1.2.3");
  });

  it("resolves aliased DB keys to the canonical runtime (claude-local → claude)", async () => {
    probeMock.mockResolvedValue({ installed: true, version: "1.0.0", output: "claude 1.0.0" });
    const res = await adapterPreflight("claude-local");
    expect(probeMock).toHaveBeenCalledWith("claude", ["--version"]);
    expect(res.ok).toBe(true);
  });

  it("fails with readable reasons when the CLI is not installed (ENOENT)", async () => {
    probeMock.mockResolvedValue({ installed: false, version: null, output: "" });
    const res = await adapterPreflight("gemini");
    expect(res.ok).toBe(false);
    const installed = res.checks.find((c) => c.name === "CLI installed")!;
    expect(installed.ok).toBe(false);
    expect(installed.detail).toMatch(/was not found on PATH/i);
    // no raw error text — a friendly reason instead
    expect(installed.detail).toMatch(/install/i);
  });

  it("flags an auth failure with the auth_required family", async () => {
    probeMock.mockResolvedValue({
      installed: true,
      version: null,
      output: "Error: not logged in — please run `gemini auth login` first",
    });
    const res = await adapterPreflight("gemini");
    expect(res.ok).toBe(false);
    expect(res.errorFamily).toBe("auth_required");
    const auth = res.checks.find((c) => c.name === "Authenticated")!;
    expect(auth.ok).toBe(false);
  });

  it("reports generic/remote adapters have no local CLI to probe (never spawns)", async () => {
    const res = await adapterPreflight("http");
    expect(probeMock).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(res.checks[0].detail).toMatch(/no local CLI/i);
  });

  it("shapes an unknown adapter into a failed check instead of throwing", async () => {
    const res = await adapterPreflight("does-not-exist");
    expect(probeMock).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
    expect(res.checks[0].detail).toMatch(/unknown runtime adapter/i);
  });
});
