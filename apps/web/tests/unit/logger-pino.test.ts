import { describe, it, expect, vi, afterEach } from "vitest";
import { log, logWarn, logError } from "../../src/server/logger";

// Part 2 - the logger is now backed by pino. It must still emit a structured JSON line with the same
// shape (timestamp / level / tag / message / extra), route warn+error to stderr, and redact secrets.

function captureStdout(fn: () => void): string {
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    fn();
    return spy.mock.calls.map((c) => String(c[0])).join("");
  } finally {
    spy.mockRestore();
  }
}

function captureStderr(fn: () => void): string {
  const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    fn();
    return spy.mock.calls.map((c) => String(c[0])).join("");
  } finally {
    spy.mockRestore();
  }
}

afterEach(() => vi.restoreAllMocks());

describe("pino-backed logger", () => {
  it("emits a structured line with timestamp/level/tag/message + extra", () => {
    const out = captureStdout(() => log("run", "started", { runId: "r1", count: 3 }));
    const parsed = JSON.parse(out);
    expect(parsed.level).toBe("info");
    expect(parsed.tag).toBe("run");
    expect(parsed.message).toBe("started");
    expect(parsed.runId).toBe("r1");
    expect(parsed.count).toBe(3);
    expect(typeof parsed.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(parsed.timestamp))).toBe(false);
  });

  it("routes warn and error to stderr with the right level label", () => {
    const warnOut = captureStderr(() => logWarn("sec", "heads up"));
    expect(JSON.parse(warnOut).level).toBe("warn");

    const errOut = captureStderr(() => logError("sec", "boom"));
    expect(JSON.parse(errOut).level).toBe("error");
  });

  it("redacts a sensitive field before it is written", () => {
    const token = "sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
    const out = captureStdout(() =>
      log("auth", "using key", { apiKey: token, email: "user@example.com" }),
    );
    expect(out).not.toContain(token);
    expect(out).not.toContain("user@example.com");
    expect(out).toContain("[redacted]");
    // Still valid JSON after redaction.
    expect(() => JSON.parse(out)).not.toThrow();
  });
});
