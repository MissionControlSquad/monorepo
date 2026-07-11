import { describe, it, expect } from "vitest";
import type { GraphQLContext, TenancyContext, WorkspaceRole } from "@agentcenter/graphql-server";
import { roleAtLeast, roleCan } from "@/server/tenancy/roles";
import { requireTenancy, requireRole, requirePermission, scoped } from "@/server/tenancy/guards";
import { resolveTenancy } from "@/server/tenancy/resolve";

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

describe("resolveTenancy (bootstrap)", () => {
  it("returns null when there is no session", () => {
    expect(resolveTenancy(null)).toBeNull();
    expect(resolveTenancy({ sub: "s", username: "u" } as GraphQLContext["session"])).toBeNull();
  });

  it("maps an admin session to the default workspace as owner", () => {
    const t = resolveTenancy({
      sub: "s",
      username: "u",
      profileId: "p1",
    } as GraphQLContext["session"]);
    expect(t).not.toBeNull();
    expect(t!.userId).toBe("p1");
    expect(t!.role).toBe("owner");
    expect(t!.workspaceId).toBeTruthy();
    expect(t!.can("delete")).toBe(true);
  });
});
