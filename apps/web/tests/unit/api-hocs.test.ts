import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks for withAgent's dependencies ───────────────────────────────────────
const resolveAgent = vi.fn();
const requireAgentCapability = vi.fn();
const isFeatureEnabled = vi.fn();
const isSystemShutdown = vi.fn();

vi.mock("../../app/api/_lib/resolve-agent", () => ({
  resolveAgent: (...a: unknown[]) => resolveAgent(...a),
}));
vi.mock("@/server/services/agent-authz", () => ({
  requireAgentCapability: (...a: unknown[]) => requireAgentCapability(...a),
}));
vi.mock("@/server/feature-flags", () => ({
  isFeatureEnabled: (...a: unknown[]) => isFeatureEnabled(...a),
}));
vi.mock("@/server/system-settings", () => ({
  isSystemShutdown: (...a: unknown[]) => isSystemShutdown(...a),
}));

// ── Mocks for withTenancy's dependencies ─────────────────────────────────────
const resolveTenancy = vi.fn();
vi.mock("@/server/tenancy", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, resolveTenancy: (...a: unknown[]) => resolveTenancy(...a) };
});
vi.mock("@/server/admin-auth", () => ({
  COOKIE_NAME: "mc_session",
  verifySessionToken: vi.fn(async () => null),
}));

// ── Mocks for withCronAuth ───────────────────────────────────────────────────
vi.mock("@/server/env", () => ({ env: { CRON_SECRET: "cron-secret" } }));

import { withAgent } from "../../app/api/_lib/with-agent";
import { withCronAuth } from "../../app/api/_lib/with-cron-auth";
import { withTenancy } from "../../app/api/_lib/rest-tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";

const req = (headers: Record<string, string> = {}) => new Request("http://x/api", { headers });
const CTX = { params: Promise.resolve({}) };
const body = async (res: Response) => res.json().catch(() => ({}));

describe("withAgent", () => {
  beforeEach(() => {
    resolveAgent.mockReset().mockResolvedValue({ id: "a1", role: "member", workspaceId: "w1" });
    requireAgentCapability.mockReset().mockResolvedValue(undefined);
    isFeatureEnabled.mockReset().mockResolvedValue(true);
    isSystemShutdown.mockReset().mockResolvedValue(false);
  });

  it("passes (request, agent, ctx) to the handler on success", async () => {
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const res = await withAgent(handler)(req(), CTX);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(
      expect.any(Request),
      { id: "a1", role: "member", workspaceId: "w1" },
      CTX,
    );
  });

  it("standard feature gate → 403 FEATURE_DISABLED", async () => {
    isFeatureEnabled.mockResolvedValue(false);
    const res = await withAgent(async () => Response.json({}), { feature: "RUNNERS" as never })(
      req(),
      CTX,
    );
    expect(res.status).toBe(403);
    expect(await body(res)).toMatchObject({
      code: "FEATURE_DISABLED",
      error: expect.stringContaining("not enabled"),
    });
  });

  it("custom-message feature gate preserves the message", async () => {
    isFeatureEnabled.mockResolvedValue(false);
    const res = await withAgent(async () => Response.json({}), {
      feature: { flag: "RUNNERS" as never, error: "Runners are not enabled" },
    })(req(), CTX);
    expect(res.status).toBe(403);
    expect((await body(res)).error).toBe("Runners are not enabled");
  });

  it("blockOnShutdown → 503 SYSTEM_SHUTDOWN when in maintenance", async () => {
    isSystemShutdown.mockResolvedValue(true);
    const res = await withAgent(async () => Response.json({}), { blockOnShutdown: true })(
      req(),
      CTX,
    );
    expect(res.status).toBe(503);
    expect((await body(res)).code).toBe("SYSTEM_SHUTDOWN");
  });

  it("blockOnShutdown carries a custom message", async () => {
    isSystemShutdown.mockResolvedValue(true);
    const res = await withAgent(async () => Response.json({}), {
      blockOnShutdown: { error: "No new tasks." },
    })(req(), CTX);
    expect((await body(res)).error).toBe("No new tasks.");
  });

  it("resolveAgent failure is mapped by handleError (401)", async () => {
    resolveAgent.mockRejectedValue({ error: "Invalid API key", status: 401 });
    const res = await withAgent(async () => Response.json({}))(req(), CTX);
    expect(res.status).toBe(401);
  });

  it("enforces an unscoped capability", async () => {
    requireAgentCapability.mockRejectedValue({ error: "forbidden", status: 403 });
    const res = await withAgent(async () => Response.json({}), { capability: "tasks:complete" })(
      req(),
      CTX,
    );
    expect(res.status).toBe(403);
    expect(requireAgentCapability).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a1" }),
      "tasks:complete",
    );
  });
});

describe("withCronAuth", () => {
  it("401 without the bearer secret", async () => {
    const res = await withCronAuth(async () => Response.json({ ok: true }))(
      req(),
      undefined as never,
    );
    expect(res.status).toBe(401);
  });
  it("401 with a wrong secret", async () => {
    const res = await withCronAuth(async () => Response.json({ ok: true }))(
      req({ authorization: "Bearer nope" }),
      undefined as never,
    );
    expect(res.status).toBe(401);
  });
  it("runs the job with the correct secret", async () => {
    const res = await withCronAuth(async () => Response.json({ ok: true }))(
      req({ authorization: "Bearer cron-secret" }),
      undefined as never,
    );
    expect(res.status).toBe(200);
    expect((await body(res)).ok).toBe(true);
  });
});

describe("withTenancy", () => {
  beforeEach(() => {
    resolveTenancy.mockReset();
    isFeatureEnabled.mockReset().mockResolvedValue(true);
  });

  it("401 when unauthenticated", async () => {
    resolveTenancy.mockResolvedValue(null);
    const res = await withTenancy(async () => Response.json({ ok: true }))(req(), CTX);
    expect(res.status).toBe(401);
  });

  it("403 when below the required role", async () => {
    resolveTenancy.mockResolvedValue({
      userId: "u",
      workspaceId: "w",
      role: "member",
      can: () => false,
    });
    const res = await withTenancy(async () => Response.json({ ok: true }), {
      minRole: WORKSPACE_ROLES.ADMIN,
    })(req(), CTX);
    expect(res.status).toBe(403);
  });

  it("passes the verified tenancy to the handler when authorized", async () => {
    const tenancy = { userId: "u", workspaceId: "w", role: "admin", can: () => true };
    resolveTenancy.mockResolvedValue(tenancy);
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const res = await withTenancy(handler, { minRole: WORKSPACE_ROLES.ADMIN })(req(), CTX);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(expect.any(Request), tenancy, CTX);
  });

  it("feature gate → 403 with the custom message when the flag is off", async () => {
    isFeatureEnabled.mockResolvedValue(false);
    resolveTenancy.mockResolvedValue({
      userId: "u",
      workspaceId: "w",
      role: "admin",
      can: () => true,
    });
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const res = await withTenancy(handler, {
      feature: { flag: "BUDGETS" as never, error: "Budgets are not enabled" },
    })(req(), CTX);
    expect(res.status).toBe(403);
    expect(await body(res)).toMatchObject({
      code: "FEATURE_DISABLED",
      error: "Budgets are not enabled",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("role is checked BEFORE the feature gate (below-role → FORBIDDEN, not FEATURE_DISABLED)", async () => {
    isFeatureEnabled.mockResolvedValue(false);
    resolveTenancy.mockResolvedValue({
      userId: "u",
      workspaceId: "w",
      role: "member",
      can: () => false,
    });
    const res = await withTenancy(async () => Response.json({ ok: true }), {
      minRole: WORKSPACE_ROLES.ADMIN,
      feature: { flag: "BUDGETS" as never },
    })(req(), CTX);
    expect(res.status).toBe(403);
    expect((await body(res)).code).toBe("FORBIDDEN");
  });
});
