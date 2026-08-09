import { describe, it, expect } from "vitest";
import { sessionCodec, shouldCompactSession } from "@agentcenter/utils";

describe("sessionCodec (#F9)", () => {
  it("round-trips params", () => {
    const p = { sessionId: "abc", model: "x" };
    expect(sessionCodec.deserialize(sessionCodec.serialize(p))).toEqual(p);
    expect(sessionCodec.deserialize("not json")).toEqual({});
  });
  it("getDisplayId prefers an explicit id, else a stable hash", () => {
    expect(sessionCodec.getDisplayId({ sessionId: "sess-123" })).toBe("sess-123");
    const a = sessionCodec.getDisplayId({ model: "x", seed: 1 });
    const b = sessionCodec.getDisplayId({ model: "x", seed: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^sess_[0-9a-f]{8}$/);
  });
});

describe("shouldCompactSession (#F9)", () => {
  it("rotates on run count / tokens / age", () => {
    expect(
      shouldCompactSession({ runCount: 50, tokens: 0, ageMs: 0 }, { maxRuns: 50 }).compact,
    ).toBe(true);
    expect(
      shouldCompactSession({ runCount: 0, tokens: 1000, ageMs: 0 }, { maxTokens: 1000 }).compact,
    ).toBe(true);
    expect(
      shouldCompactSession({ runCount: 0, tokens: 0, ageMs: 10_000 }, { maxAgeMs: 5000 }).compact,
    ).toBe(true);
  });
  it("does not rotate below all thresholds", () => {
    expect(
      shouldCompactSession(
        { runCount: 1, tokens: 1, ageMs: 1 },
        { maxRuns: 50, maxTokens: 1000, maxAgeMs: 1e9 },
      ).compact,
    ).toBe(false);
  });
});
