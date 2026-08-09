import { describe, it, expect } from "vitest";
import { redactSensitive, redactSensitiveVerbose } from "@agentcenter/utils";

describe("redactSensitive (parity #61)", () => {
  it("masks provider keys, github/slack tokens, AWS ids, google keys, JWTs", () => {
    expect(redactSensitive("key sk-ABCDEFGH1234567890XYZ here")).toBe("key [redacted] here");
    expect(redactSensitive("ghp_abcdefghijklmnopqrstuvwxyz0123")).toBe("[redacted]");
    expect(redactSensitive("xoxb-1234567890-abcdEFGH")).toBe("[redacted]");
    expect(redactSensitive("AKIAIOSFODNN7EXAMPLE")).toBe("[redacted]");
    expect(redactSensitive("AIzaSyA1234567890abcdefghijklmnopqrstuv")).toBe("[redacted]");
    expect(redactSensitive("token eyJhbGciOi.eyJzdWIiOi.SflKxwRJSM")).toBe("token [redacted]");
  });

  it("masks bearer tokens, credential URLs, and emails (PII)", () => {
    expect(redactSensitive("Authorization: Bearer abcdef1234567890")).toContain("[redacted]");
    expect(redactSensitive("https://user:s3cretpw@host.com/x")).toBe(
      "https://[redacted]host.com/x",
    );
    expect(redactSensitive("ping me at alice@example.com please")).toBe(
      "ping me at [redacted] please",
    );
  });

  it("masks assigned secrets but keeps the key name", () => {
    expect(redactSensitive('api_key="supersecretvalue123"')).toBe("api_key= [redacted]");
    expect(redactSensitive("password: hunter2xyz")).toBe("password: [redacted]");
  });

  it("leaves ordinary prose untouched", () => {
    const prose = "The task looks good but the nav bar is off by 2px on mobile.";
    expect(redactSensitive(prose)).toBe(prose);
  });

  it("reports which kinds matched", () => {
    const r = redactSensitiveVerbose("mail bob@x.io and key ghp_abcdefghijklmnopqrstuvwxyz01");
    expect(r.redactedKinds).toContain("email");
    expect(r.redactedKinds).toContain("github-token");
    expect(r.text).not.toContain("bob@x.io");
  });

  it("is a no-op on empty input", () => {
    expect(redactSensitive("")).toBe("");
  });
});
