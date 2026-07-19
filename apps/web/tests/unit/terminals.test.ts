import { describe, it, expect } from "vitest";
import {
  parseSshCommand,
  isUnsafeSessionWorkspaceCwd,
  terminalSessionState,
} from "@/server/services/terminals";

// Epic #9: pure SSH parsing + cwd guard + lifecycle state. No DB. Parse cases ported from Paperclip
// `environment-custom-image-terminal-sessions.test.ts`.

describe("parseSshCommand (ported)", () => {
  it("parses a plain destination (default port 22)", () => {
    expect(parseSshCommand("ssh user@example.test")).toEqual({
      username: "user",
      host: "example.test",
      port: 22,
    });
  });
  it("parses -p after the destination", () => {
    expect(parseSshCommand("ssh user@example.test -p 2222")).toEqual({
      username: "user",
      host: "example.test",
      port: 2222,
    });
  });
  it("parses -p before the destination", () => {
    expect(parseSshCommand("ssh -p 2200 user@example.test")).toEqual({
      username: "user",
      host: "example.test",
      port: 2200,
    });
  });
  it("accepts a provider redacted-token username", () => {
    expect(parseSshCommand("ssh dtca_redacted-token.123@ssh.app.daytona.io")).toEqual({
      username: "dtca_redacted-token.123",
      host: "ssh.app.daytona.io",
      port: 22,
    });
  });
  it("rejects unsupported shapes (injection-safe)", () => {
    expect(parseSshCommand("scp user@example.test")).toBeNull();
    expect(parseSshCommand("ssh user@example.test -i key")).toBeNull();
    expect(parseSshCommand("ssh user@example.test:2222")).toBeNull();
    expect(parseSshCommand("ssh -p not-a-port user@example.test")).toBeNull();
    expect(parseSshCommand("ssh -p 70000 user@example.test")).toBeNull();
    expect(parseSshCommand("ssh user@@example.test")).toBeNull();
  });
});

describe("isUnsafeSessionWorkspaceCwd (ported)", () => {
  it("flags system roots", () => {
    for (const root of ["/", "/tmp", "/etc", "/var/tmp", "/private/tmp", "/usr/"]) {
      expect(isUnsafeSessionWorkspaceCwd(root)).toBe(true);
    }
  });
  it("allows a real workspace path", () => {
    expect(isUnsafeSessionWorkspaceCwd("/home/agent/project")).toBe(false);
    expect(isUnsafeSessionWorkspaceCwd("/workspace")).toBe(false);
  });
  it("treats empty/null as safe (no cwd given)", () => {
    expect(isUnsafeSessionWorkspaceCwd(null)).toBe(false);
    expect(isUnsafeSessionWorkspaceCwd("")).toBe(false);
    expect(isUnsafeSessionWorkspaceCwd("   ")).toBe(false);
  });
});

describe("terminalSessionState", () => {
  const base = {
    sessionExpiresAt: new Date("2026-07-13T12:00:00Z"),
    closedAt: null as Date | null,
  };
  const before = new Date("2026-07-13T11:00:00Z");
  const after = new Date("2026-07-13T13:00:00Z");

  it("pending before expiry", () => {
    expect(terminalSessionState({ ...base, status: "pending" }, before)).toBe("pending");
  });
  it("active before expiry", () => {
    expect(terminalSessionState({ ...base, status: "active" }, before)).toBe("active");
  });
  it("expired once past the session expiry", () => {
    expect(terminalSessionState({ ...base, status: "active" }, after)).toBe("expired");
  });
  it("closed wins regardless of expiry", () => {
    expect(
      terminalSessionState(
        { status: "active", sessionExpiresAt: base.sessionExpiresAt, closedAt: before },
        before,
      ),
    ).toBe("closed");
  });
});
