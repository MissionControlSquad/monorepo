import { describe, it, expect } from "vitest";
import {
  setupSessionNext,
  isSetupSessionTerminal,
  isSetupSessionExpired,
  SetupSessionError,
} from "@agentcenter/utils";

describe("setup-session state machine (#47/#48)", () => {
  it("active → capturing → captured", () => {
    expect(setupSessionNext("active", "beginCapture")).toBe("capturing");
    expect(setupSessionNext("capturing", "captureOk")).toBe("captured");
    expect(isSetupSessionTerminal("captured")).toBe(true);
  });

  it("capture failure is terminal", () => {
    expect(setupSessionNext("capturing", "captureFail")).toBe("failed");
    expect(isSetupSessionTerminal("failed")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(() => setupSessionNext("active", "captureOk")).toThrow(SetupSessionError);
    expect(() => setupSessionNext("capturing", "beginCapture")).toThrow(/only an active/);
    expect(() => setupSessionNext("captured", "abort")).toThrow(/terminal/);
  });

  it("abort/expire only from a non-terminal state", () => {
    expect(setupSessionNext("active", "abort")).toBe("aborted");
    expect(setupSessionNext("active", "expire")).toBe("expired");
  });

  it("isSetupSessionExpired: active + past TTL", () => {
    const now = 1_000_000;
    expect(isSetupSessionExpired("active", new Date(now - 1), now)).toBe(true);
    expect(isSetupSessionExpired("active", new Date(now + 1000), now)).toBe(false);
    expect(isSetupSessionExpired("captured", new Date(now - 1), now)).toBe(false);
  });
});
