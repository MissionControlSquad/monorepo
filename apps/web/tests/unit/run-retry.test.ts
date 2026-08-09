import { describe, it, expect } from "vitest";
import {
  RETRY_BACKOFF_MS,
  MAX_RUN_RETRIES,
  isTransientRunStatus,
  shouldRetryRun,
  retryBackoffMs,
  nextRetryAt,
} from "@agentcenter/utils";

describe("run-retry backoff (Domain 9 #6)", () => {
  it("only a timeout is transient — a clean failed/done is not", () => {
    expect(isTransientRunStatus("timeout")).toBe(true);
    expect(isTransientRunStatus("failed")).toBe(false);
    expect(isTransientRunStatus("done")).toBe(false);
    expect(isTransientRunStatus("canceled")).toBe(false);
  });

  it("shouldRetryRun respects transience AND the cap", () => {
    expect(shouldRetryRun("timeout", 0)).toBe(true);
    expect(shouldRetryRun("timeout", MAX_RUN_RETRIES - 1)).toBe(true);
    expect(shouldRetryRun("timeout", MAX_RUN_RETRIES)).toBe(false); // exhausted
    expect(shouldRetryRun("failed", 0)).toBe(false); // not transient
  });

  it("retryBackoffMs follows the increasing schedule and clamps past the end", () => {
    expect(retryBackoffMs(0)).toBe(RETRY_BACKOFF_MS[0]);
    expect(retryBackoffMs(1)).toBe(RETRY_BACKOFF_MS[1]);
    expect(retryBackoffMs(99)).toBe(RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]);
    // strictly increasing
    for (let i = 1; i < RETRY_BACKOFF_MS.length; i++) {
      expect(RETRY_BACKOFF_MS[i]).toBeGreaterThan(RETRY_BACKOFF_MS[i - 1]);
    }
  });

  it("nextRetryAt = now + backoff for a retryable run, else null", () => {
    const now = new Date("2026-07-19T12:00:00Z");
    expect(nextRetryAt("timeout", 0, now)?.toISOString()).toBe(
      new Date(now.getTime() + RETRY_BACKOFF_MS[0]).toISOString(),
    );
    expect(nextRetryAt("timeout", MAX_RUN_RETRIES, now)).toBeNull(); // exhausted
    expect(nextRetryAt("failed", 0, now)).toBeNull(); // not transient
  });
});
