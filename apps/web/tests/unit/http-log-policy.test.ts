import { describe, it, expect } from "vitest";
import {
  httpLogPolicy,
  shouldSilenceHttpSuccessLog,
  shouldRedactPath,
  redactHttpPath,
} from "../../app/api/_lib/http-log-policy";

describe("shouldSilenceHttpSuccessLog", () => {
  it("silences a 2xx GET on a polling endpoint (health/quota/connections)", () => {
    expect(shouldSilenceHttpSuccessLog("GET", "/api/health", 200)).toBe(true);
    expect(shouldSilenceHttpSuccessLog("GET", "/api/provider-quota", 200)).toBe(true);
    expect(shouldSilenceHttpSuccessLog("GET", "/api/live-gateway/connections/abc", 200)).toBe(true);
    expect(shouldSilenceHttpSuccessLog("HEAD", "/api/auth/status", 204)).toBe(true);
  });

  it("does NOT silence a non-2xx status on a polling endpoint (errors stay visible)", () => {
    expect(shouldSilenceHttpSuccessLog("GET", "/api/health", 500)).toBe(false);
    expect(shouldSilenceHttpSuccessLog("GET", "/api/auth/status", 401)).toBe(false);
  });

  it("does NOT silence a mutating method even on a polling prefix", () => {
    expect(shouldSilenceHttpSuccessLog("POST", "/api/cli-auth/poll", 200)).toBe(false);
  });

  it("does NOT silence a normal business route", () => {
    expect(shouldSilenceHttpSuccessLog("GET", "/api/tasks", 200)).toBe(false);
    expect(shouldSilenceHttpSuccessLog("GET", "/api/agents", 200)).toBe(false);
  });
});

describe("shouldRedactPath / redactHttpPath", () => {
  it("flags sensitive prefixes for redaction", () => {
    expect(shouldRedactPath("/api/auth/reset")).toBe(true);
    expect(shouldRedactPath("/api/license")).toBe(true);
    expect(shouldRedactPath("/api/cli-auth/poll")).toBe(true);
    expect(shouldRedactPath("/activate")).toBe(true);
    expect(shouldRedactPath("/api/tasks")).toBe(false);
  });

  it("redacts a long token-like path segment", () => {
    const jwt = "/api/auth/verify/eyJhbGciOi.eyJzdWIiOiIxMjM0NTY.SflKxwRJSMeKKF2QT4fw";
    expect(redactHttpPath(jwt)).toBe("/api/auth/verify/[redacted]");

    const hex = "/api/license/" + "a".repeat(40);
    expect(redactHttpPath(hex)).toBe("/api/license/[redacted]");
  });

  it("keeps short ids/slugs intact", () => {
    expect(redactHttpPath("/api/tasks/t_123")).toBe("/api/tasks/t_123");
  });

  it("redacts sensitive query params", () => {
    expect(redactHttpPath("/api/auth/reset?token=supersecretvalue&next=/home")).toBe(
      "/api/auth/reset?token=[redacted]&next=/home",
    );
  });
});

describe("httpLogPolicy (combined decision)", () => {
  it("returns both silence + redactPath independently", () => {
    // cli-auth poll: a 2xx GET is silenced AND it is a redact-path prefix.
    expect(httpLogPolicy("GET", "/api/cli-auth/poll", 200)).toEqual({
      silence: true,
      redactPath: true,
    });
    // a business route: neither.
    expect(httpLogPolicy("GET", "/api/tasks", 200)).toEqual({
      silence: false,
      redactPath: false,
    });
    // health poll error: not silenced, not redacted.
    expect(httpLogPolicy("GET", "/api/health", 503)).toEqual({
      silence: false,
      redactPath: false,
    });
  });
});
