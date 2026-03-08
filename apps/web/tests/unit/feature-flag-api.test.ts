import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies
vi.mock("../../src/server/feature-flags", () => ({
  invalidateFlagCache: vi.fn(),
}));

vi.mock("../../src/server/pubsub", () => ({
  pubsub: { publish: vi.fn() },
  PubSubEvent: { FEATURE_FLAGS: { CHANGED: "featureFlags:changed" } },
}));

import { invalidateFlagCache } from "../../src/server/feature-flags";
import { pubsub } from "../../src/server/pubsub";

describe("feature-flags invalidate API", () => {
  const CRON_SECRET = "test-secret";

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    (invalidateFlagCache as ReturnType<typeof vi.fn>).mockClear();
    (pubsub.publish as ReturnType<typeof vi.fn>).mockClear();
  });

  async function callInvalidate(authHeader?: string) {
    const { POST } = await import("../../app/api/feature-flags/invalidate/route");
    const headers: Record<string, string> = {};
    if (authHeader) headers["authorization"] = authHeader;
    const req = new NextRequest("http://localhost:3000/api/feature-flags/invalidate", {
      method: "POST",
      headers,
    });
    return POST(req);
  }

  it("returns 401 without authorization header", async () => {
    const res = await callInvalidate();
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong secret", async () => {
    const res = await callInvalidate("Bearer wrong-secret");
    expect(res.status).toBe(401);
  });

  it("invalidates cache and publishes event with correct secret", async () => {
    const res = await callInvalidate(`Bearer ${CRON_SECRET}`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);

    expect(invalidateFlagCache).toHaveBeenCalledOnce();
    expect(pubsub.publish).toHaveBeenCalledWith("featureFlags:changed", {});
  });
});
