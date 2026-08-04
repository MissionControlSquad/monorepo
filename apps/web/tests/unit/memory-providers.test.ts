import { describe, it, expect } from "vitest";
import { isMemoryProvider, resolveMemoryProvider, MEMORY_PROVIDERS } from "@agentcenter/utils";

// Pure memory-provider binding resolution (agent override → company default → "none").
describe("memory providers", () => {
  it("recognises exactly the known providers", () => {
    expect([...MEMORY_PROVIDERS]).toEqual(["none", "markdown", "db"]);
    for (const p of MEMORY_PROVIDERS) expect(isMemoryProvider(p)).toBe(true);
    expect(isMemoryProvider("mem0")).toBe(false);
    expect(isMemoryProvider("")).toBe(false);
  });

  it("prefers a valid agent override", () => {
    expect(resolveMemoryProvider("db", "markdown")).toBe("db");
  });

  it("falls through to the company default when the agent has none", () => {
    expect(resolveMemoryProvider(null, "markdown")).toBe("markdown");
    expect(resolveMemoryProvider(undefined, "db")).toBe("db");
  });

  it("ignores invalid values at either layer and ends at none", () => {
    expect(resolveMemoryProvider("bogus", "markdown")).toBe("markdown");
    expect(resolveMemoryProvider("bogus", "also-bad")).toBe("none");
    expect(resolveMemoryProvider(null, null)).toBe("none");
  });
});
