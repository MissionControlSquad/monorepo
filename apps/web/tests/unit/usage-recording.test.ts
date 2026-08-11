import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the server-side HUMAN plan-quota recording helper (Epic #1).
 *
 * SDK note: without a provisioned buildbase org, real usage data can't be exercised. These tests
 * mock `getBuildbase`/`isBuildbaseConfigured` and assert the guard + fail-safe contract:
 *  - no-op when buildbase is unconfigured,
 *  - correct `usage.record(workspaceId, {...})` call when configured,
 *  - a thrown recording error is swallowed (never breaks the create),
 *  - workspace/session resolution from request cookies (valid vs missing/invalid JWT).
 */

const record = vi.fn();
const withSession = vi.fn(() => ({ usage: { record } }));
const getBuildbase = vi.fn(() => ({ withSession }));
const isBuildbaseConfigured = vi.fn(() => true);

vi.mock("@/server/tenancy/buildbase", () => ({
  getBuildbase: () => getBuildbase(),
  isBuildbaseConfigured: () => isBuildbaseConfigured(),
  BB_SESSION_COOKIE: "bb-session-id",
}));

import {
  recordPlanUsage,
  recordPlanUsageFromRequest,
  resolveUsageContext,
} from "@/server/tenancy/usage";
import { createJWT } from "@/lib/jwt";

const SECRET = "test-system-secret";

function requestWithCookies(cookie: string): Request {
  return new Request("https://example.com/api/agents/create", {
    method: "POST",
    headers: { cookie },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  isBuildbaseConfigured.mockReturnValue(true);
  record.mockResolvedValue({
    consumed: 1,
    included: 5,
    available: 4,
    overage: 0,
    used: 1,
    billedAsync: false,
  });
  process.env.SYSTEM_SECRET = SECRET;
});

describe("recordPlanUsage", () => {
  it("no-ops (returns false) when buildbase is not configured", async () => {
    isBuildbaseConfigured.mockReturnValue(false);
    const ok = await recordPlanUsage({ sessionId: "s1", workspaceId: "ws1", quotaSlug: "agents" });
    expect(ok).toBe(false);
    expect(record).not.toHaveBeenCalled();
  });

  it("records against the session-scoped workspace when configured", async () => {
    const ok = await recordPlanUsage({
      sessionId: "sess-1",
      workspaceId: "ws-1",
      quotaSlug: "agents",
    });
    expect(ok).toBe(true);
    expect(withSession).toHaveBeenCalledWith("sess-1");
    expect(record).toHaveBeenCalledWith("ws-1", {
      quotaSlug: "agents",
      quantity: 1,
      source: "web-app",
      metadata: undefined,
    });
  });

  it("passes through custom quantity/source/metadata", async () => {
    await recordPlanUsage({
      sessionId: "s",
      workspaceId: "w",
      quotaSlug: "projects",
      quantity: 3,
      source: "test",
      metadata: { a: 1 },
    });
    expect(record).toHaveBeenCalledWith("w", {
      quotaSlug: "projects",
      quantity: 3,
      source: "test",
      metadata: { a: 1 },
    });
  });

  it("is fail-safe: swallows a recording error and returns false", async () => {
    record.mockRejectedValueOnce(new Error("boom"));
    const ok = await recordPlanUsage({ sessionId: "s", workspaceId: "w", quotaSlug: "agents" });
    expect(ok).toBe(false); // did not throw
  });
});

describe("resolveUsageContext", () => {
  it("resolves session + workspace from a valid workspace token cookie", async () => {
    const token = await createJWT(
      { userId: "u1", workspaceId: "ws-42", userRole: "owner" },
      SECRET,
    );
    const req = requestWithCookies(`bb-session-id=sess-9; bb-workspace-token=${token}`);
    const ctx = await resolveUsageContext(req);
    expect(ctx).toEqual({ sessionId: "sess-9", workspaceId: "ws-42" });
  });

  it("returns null when the session cookie is missing", async () => {
    const token = await createJWT({ userId: "u1", workspaceId: "ws-42" }, SECRET);
    const req = requestWithCookies(`bb-workspace-token=${token}`);
    expect(await resolveUsageContext(req)).toBeNull();
  });

  it("returns null when the workspace token signature is invalid", async () => {
    const token = await createJWT({ userId: "u1", workspaceId: "ws-42" }, "wrong-secret");
    const req = requestWithCookies(`bb-session-id=s; bb-workspace-token=${token}`);
    expect(await resolveUsageContext(req)).toBeNull();
  });

  it("returns null when there are no cookies at all", async () => {
    const req = new Request("https://example.com", { method: "POST" });
    expect(await resolveUsageContext(req)).toBeNull();
  });
});

describe("recordPlanUsageFromRequest", () => {
  it("resolves the request session and records", async () => {
    const token = await createJWT({ userId: "u1", workspaceId: "ws-77" }, SECRET);
    const req = requestWithCookies(`bb-session-id=sess-77; bb-workspace-token=${token}`);
    const ok = await recordPlanUsageFromRequest(req, { quotaSlug: "agents" });
    expect(ok).toBe(true);
    expect(record).toHaveBeenCalledWith(
      "ws-77",
      expect.objectContaining({ quotaSlug: "agents", quantity: 1 }),
    );
  });

  it("no-ops for a non-human request (no buildbase cookies) without throwing", async () => {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { authorization: "Bearer mc_agentkey" },
    });
    const ok = await recordPlanUsageFromRequest(req, { quotaSlug: "projects" });
    expect(ok).toBe(false);
    expect(record).not.toHaveBeenCalled();
  });

  it("no-ops when buildbase is unconfigured even with valid cookies", async () => {
    isBuildbaseConfigured.mockReturnValue(false);
    const token = await createJWT({ userId: "u1", workspaceId: "ws-1" }, SECRET);
    const req = requestWithCookies(`bb-session-id=s; bb-workspace-token=${token}`);
    const ok = await recordPlanUsageFromRequest(req, { quotaSlug: "agents" });
    expect(ok).toBe(false);
    expect(record).not.toHaveBeenCalled();
  });
});
