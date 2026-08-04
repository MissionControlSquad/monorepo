import { describe, it, expect } from "vitest";
import { fetchAllProviderQuota } from "../../src/server/services/provider-quota";
import type { Adapter, ProviderQuotaWindow } from "@agentcenter/utils";

function mockAdapter(key: string, over: Partial<Adapter>): Adapter {
  return {
    key,
    displayName: key,
    requiresTemplate: false,
    supportsModel: false,
    models: [],
    build: () => ({
      mode: "spawn",
      argv: [key],
      cwd: "/",
      useShell: false,
      layout: { instructionsFile: "A", skillsDir: "s", identityFile: "I", taskFile: "T" },
    }),
    ...over,
  };
}

describe("provider quota fan-out (Domain 12 GAP-2)", () => {
  it("polls only adapters that implement getQuotaWindows; omits the rest", async () => {
    const windows: ProviderQuotaWindow[] = [
      { label: "requests (5h)", usedPercent: 42, resetsAt: null },
    ];
    const results = await fetchAllProviderQuota({
      adapters: [
        mockAdapter("with-quota", { getQuotaWindows: async () => windows }),
        mockAdapter("no-quota", {}), // no hook → omitted
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ provider: "with-quota", ok: true });
    expect(results[0].windows[0]).toMatchObject({ label: "requests (5h)", usedPercent: 42 });
  });

  it("shapes a thrown provider error instead of rejecting the whole fan-out", async () => {
    const results = await fetchAllProviderQuota({
      adapters: [
        mockAdapter("ok", { getQuotaWindows: async () => [] }),
        mockAdapter("broken", {
          getQuotaWindows: async () => {
            throw new Error("401 unauthorized");
          },
        }),
      ],
    });
    const byProvider = Object.fromEntries(results.map((r) => [r.provider, r]));
    expect(byProvider.ok).toMatchObject({ ok: true });
    expect(byProvider.broken).toMatchObject({ ok: false, errorFamily: "provider_error" });
    expect(byProvider.broken.error).toContain("401");
  });

  it("times out a slow provider without blocking a fast one", async () => {
    const results = await fetchAllProviderQuota({
      timeoutMs: 30,
      adapters: [
        mockAdapter("fast", {
          getQuotaWindows: async () => [{ label: "credits", usedPercent: 10, resetsAt: null }],
        }),
        mockAdapter("slow", {
          getQuotaWindows: () => new Promise((r) => setTimeout(() => r([]), 500)),
        }),
      ],
    });
    const byProvider = Object.fromEntries(results.map((r) => [r.provider, r]));
    expect(byProvider.fast.ok).toBe(true);
    expect(byProvider.slow).toMatchObject({ ok: false, errorFamily: "timeout" });
  });

  it("returns [] when no adapter supports quota windows", async () => {
    expect(await fetchAllProviderQuota({ adapters: [mockAdapter("x", {})] })).toEqual([]);
  });
});
