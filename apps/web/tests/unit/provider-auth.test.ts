import { describe, it, expect } from "vitest";
import { classifyProviderAuth } from "@agentcenter/utils";

const HOUR = 3_600_000;

describe("classifyProviderAuth (#25)", () => {
  it("valid when well before expiry", () => {
    expect(classifyProviderAuth({ expiresAt: new Date(2 * HOUR), now: 0 })).toMatchObject({
      state: "valid",
      action: "none",
    });
  });

  it("expiring within the refresh window → refresh", () => {
    expect(
      classifyProviderAuth({
        expiresAt: new Date(5 * 60_000),
        now: 0,
        refreshWindowMs: 10 * 60_000,
      }),
    ).toMatchObject({ state: "expiring", action: "refresh" });
  });

  it("expired → reauth", () => {
    expect(classifyProviderAuth({ expiresAt: new Date(-1), now: 0 })).toMatchObject({
      state: "expired",
      action: "reauth",
    });
  });

  it("revoked → reauth (overrides expiry)", () => {
    expect(
      classifyProviderAuth({ revoked: true, expiresAt: new Date(HOUR), now: 0 }),
    ).toMatchObject({
      state: "revoked",
      action: "reauth",
    });
  });

  it("no expiry → unknown/none", () => {
    expect(classifyProviderAuth({ now: 0 }).state).toBe("unknown");
  });
});
