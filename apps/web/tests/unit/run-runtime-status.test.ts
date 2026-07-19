import { describe, it, expect, beforeEach } from "vitest";
import {
  beginRunStatus,
  setRunPhase,
  appendRunLog,
  getRunRuntimeStatus,
  clearRunStatuses,
} from "../../src/server/services/run-runtime-status";

// Tier D / Phase 3 (Plan 6): the in-memory live run status — redaction + TTL, no DB.
describe("run runtime status", () => {
  beforeEach(() => clearRunStatuses());

  it("tracks phase + tail and returns them", () => {
    beginRunStatus("r1", []);
    setRunPhase("r1", "running");
    appendRunLog("r1", "hello ");
    appendRunLog("r1", "world");
    expect(getRunRuntimeStatus("r1")).toEqual({ phase: "running", tail: "hello world" });
  });

  it("redacts known secret values from the tail", () => {
    beginRunStatus("r2", ["sk-supersecret", "ghp_token123"]);
    appendRunLog("r2", "key=sk-supersecret and token=ghp_token123 done");
    const s = getRunRuntimeStatus("r2")!;
    expect(s.tail).not.toContain("sk-supersecret");
    expect(s.tail).not.toContain("ghp_token123");
    expect(s.tail).toContain("«redacted»");
  });

  it("returns null for an unknown run", () => {
    expect(getRunRuntimeStatus("nope")).toBeNull();
  });

  it("evicts entries past the TTL", () => {
    const t0 = 1_000_000;
    beginRunStatus("r3", [], t0);
    appendRunLog("r3", "x", t0);
    // still present just under TTL
    expect(getRunRuntimeStatus("r3", t0 + 89_000)).not.toBeNull();
    // gone past TTL (90s)
    expect(getRunRuntimeStatus("r3", t0 + 91_000)).toBeNull();
  });

  it("ignores appends/phase for a run that was never begun", () => {
    appendRunLog("ghost", "x");
    setRunPhase("ghost", "done");
    expect(getRunRuntimeStatus("ghost")).toBeNull();
  });
});
