import { describe, it, expect } from "vitest";
import type { GraphQLContext, TenancyContext, WorkspaceRole } from "@agentcenter/graphql-server";
import { roleAtLeast, roleCan } from "@/server/tenancy/roles";
import { requireTenancy, requireRole, requirePermission, scoped } from "@/server/tenancy/guards";
import { resolveTenancy } from "@/server/tenancy/resolve";
import { createJWT } from "@/lib/jwt";

function tenancy(role: WorkspaceRole, workspaceId = "ws_1"): TenancyContext {
  return { userId: "u1", workspaceId, role, can: (p) => roleCan(role, p) };
}
function ctx(t: TenancyContext | null): GraphQLContext {
  return { tenancy: t } as unknown as GraphQLContext;
}

describe("roles", () => {
  it("orders owner > admin > member > viewer", () => {
    expect(roleAtLeast("owner", "admin")).toBe(true);
    expect(roleAtLeast("admin", "admin")).toBe(true);
    expect(roleAtLeast("member", "admin")).toBe(false);
    expect(roleAtLeast("viewer", "member")).toBe(false);
  });

  it("grants manage to owner/admin and read-only to member/viewer", () => {
    expect(roleCan("owner", "anything")).toBe(true);
    expect(roleCan("admin", "delete")).toBe(true);
    expect(roleCan("member", "read")).toBe(true);
    expect(roleCan("member", "write")).toBe(false);
    expect(roleCan("viewer", "write")).toBe(false);
  });
});

describe("guards", () => {
  it("requireTenancy throws UNAUTHENTICATED when absent", () => {
    expect(() => requireTenancy(ctx(null))).toThrowError(/Not authenticated/);
  });

  it("requireRole denies member when admin required, allows admin", () => {
    expect(() => requireRole(ctx(tenancy("member")), "admin")).toThrowError(/Requires 'admin'/);
    expect(requireRole(ctx(tenancy("admin")), "admin").role).toBe("admin");
    expect(requireRole(ctx(tenancy("owner")), "admin").role).toBe("owner");
  });

  it("requirePermission enforces capability", () => {
    expect(() => requirePermission(ctx(tenancy("member")), "write")).toThrowError(
      /Missing permission/,
    );
    expect(requirePermission(ctx(tenancy("admin")), "write").role).toBe("admin");
  });

  it("scoped injects the caller's workspaceId and never leaks across workspaces", () => {
    const where = scoped(ctx(tenancy("admin", "ws_A")), { status: "active" });
    expect(where).toEqual({ status: "active", workspaceId: "ws_A" });
    // a caller in ws_A can never produce a filter for ws_B
    expect(scoped(ctx(tenancy("member", "ws_A"))).workspaceId).toBe("ws_A");
  });

  it("scoped throws when there is no tenancy", () => {
    expect(() => scoped(ctx(null))).toThrowError(/Not authenticated/);
  });
});

describe("resolveTenancy", () => {
  const adminSession = { sub: "s", username: "u", profileId: "p1" } as GraphQLContext["session"];

  it("returns null when there is no session and no token", async () => {
    expect(await resolveTenancy(null)).toBeNull();
    expect(
      await resolveTenancy({ sub: "s", username: "u" } as GraphQLContext["session"]),
    ).toBeNull();
  });

  it("maps an admin session to the default workspace as owner (bootstrap)", async () => {
    const t = await resolveTenancy(adminSession);
    expect(t).not.toBeNull();
    expect(t!.userId).toBe("p1");
    expect(t!.role).toBe("owner");
    expect(t!.workspaceId).toBeTruthy();
    expect(t!.can("delete")).toBe(true);
  });

  it("prefers a valid buildbase workspace token over the bootstrap", async () => {
    process.env.SYSTEM_SECRET = "test-secret";
    const token = await createJWT(
      { userId: "bbUser", workspaceId: "ws_bb", userRole: "member" },
      "test-secret",
    );
    const t = await resolveTenancy(adminSession, `bb-workspace-token=${token}`);
    expect(t!.userId).toBe("bbUser");
    expect(t!.workspaceId).toBe("ws_bb");
    expect(t!.role).toBe("member");
    expect(t!.can("write")).toBe(false); // member is read-only
  });

  it("ignores an invalid/tampered token and falls back to bootstrap", async () => {
    process.env.SYSTEM_SECRET = "test-secret";
    const t = await resolveTenancy(adminSession, "bb-workspace-token=not-a-valid-jwt");
    expect(t!.workspaceId).not.toBe("ws_bb");
    expect(t!.role).toBe("owner");
  });
});
