import { describe, it, expect, afterEach } from "vitest";
import {
  parseClaudeQuotaWindows,
  claudeQuotaWindows,
  setClaudeUsageReader,
  CLAUDE_UNKNOWN_QUOTA_WINDOW,
  getAdapter,
} from "@agentcenter/utils";
import { fetchAllProviderQuota } from "../../src/server/services/provider-quota";

afterEach(() => setClaudeUsageReader(null));

describe("parseClaudeQuotaWindows (pure, best-effort)", () => {
  it("shapes a rateLimits array with usedPercent from used/limit", () => {
    const raw = JSON.stringify({
      rateLimits: [
        { label: "requests (5h)", used: 1234, limit: 5000, resetsAt: "2026-01-01T00:00:00Z" },
        { label: "credits", usedPercent: 12.5 },
      ],
    });
    const windows = parseClaudeQuotaWindows(raw);
    expect(windows).toEqual([
      {
        label: "requests (5h)",
        usedPercent: 25,
        resetsAt: "2026-01-01T00:00:00Z",
        valueLabel: "1,234 / 5,000",
        detail: null,
      },
      { label: "credits", usedPercent: 12.5, resetsAt: null, valueLabel: null, detail: null },
    ]);
  });

  it("accepts a `windows` array too and clamps percent to 0..100", () => {
    const raw = JSON.stringify({ windows: [{ label: "tokens (24h)", usedPercent: 250 }] });
    expect(parseClaudeQuotaWindows(raw)[0]).toMatchObject({
      label: "tokens (24h)",
      usedPercent: 100,
    });
  });

  it("null / corrupt / unrecognized input → the explicit unknown window (never fabricated)", () => {
    expect(parseClaudeQuotaWindows(null)).toEqual([CLAUDE_UNKNOWN_QUOTA_WINDOW]);
    expect(parseClaudeQuotaWindows("not json")).toEqual([CLAUDE_UNKNOWN_QUOTA_WINDOW]);
    expect(parseClaudeQuotaWindows(JSON.stringify({ nope: true }))).toEqual([
      CLAUDE_UNKNOWN_QUOTA_WINDOW,
    ]);
    expect(parseClaudeQuotaWindows(JSON.stringify({ rateLimits: [{ noLabel: 1 }] }))).toEqual([
      CLAUDE_UNKNOWN_QUOTA_WINDOW,
    ]);
  });
});

describe("claudeQuotaWindows (injected reader)", () => {
  it("returns structured windows from an injected usage file", async () => {
    setClaudeUsageReader(() =>
      JSON.stringify({ rateLimits: [{ label: "requests (5h)", used: 10, limit: 100 }] }),
    );
    const windows = await claudeQuotaWindows();
    expect(windows).toEqual([
      {
        label: "requests (5h)",
        usedPercent: 10,
        resetsAt: null,
        valueLabel: "10 / 100",
        detail: null,
      },
    ]);
  });

  it("returns the unknown window when the reader yields null or throws", async () => {
    setClaudeUsageReader(() => null);
    expect(await claudeQuotaWindows()).toEqual([CLAUDE_UNKNOWN_QUOTA_WINDOW]);
    setClaudeUsageReader(() => {
      throw new Error("read failed");
    });
    expect(await claudeQuotaWindows()).toEqual([CLAUDE_UNKNOWN_QUOTA_WINDOW]);
  });
});

describe("claude adapter is wired for quota fan-out", () => {
  it("getAdapter('claude').getQuotaWindows is present and returns windows", async () => {
    const claude = getAdapter("claude")!;
    expect(typeof claude.getQuotaWindows).toBe("function");
    setClaudeUsageReader(() => null);
    expect(await claude.getQuotaWindows!()).toEqual([CLAUDE_UNKNOWN_QUOTA_WINDOW]);
  });

  it("fetchAllProviderQuota includes claude with an explicit unknown window when no usage file exists", async () => {
    // Point the wired fs reader at a guaranteed-missing path → honest 'unknown' window (not fabricated).
    process.env.CLAUDE_USAGE_FILE = "/nonexistent/agentcenter-test-usage-file.json";
    const results = await fetchAllProviderQuota({ adapters: [getAdapter("claude")!] });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ provider: "claude", ok: true });
    expect(results[0].windows[0]).toMatchObject({ label: "usage (unknown)", usedPercent: null });
    delete process.env.CLAUDE_USAGE_FILE;
  });
});
