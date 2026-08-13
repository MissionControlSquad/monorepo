import { describe, it, expect } from "vitest";
import type { GraphQLContext, TenancyContext, WorkspaceRole } from "@agentcenter/graphql-server";
import { roleCan, roleAtLeast } from "@/server/tenancy/roles";
import { requireRole } from "@/server/tenancy/guards";

/**
 * APPROVED team RBAC matrix (docs/RBAC.md §D) — the safety net.
 *
 * | role   | read | operate | manage |
 * | ------ | ---- | ------- | ------ |
 * | owner  |  ✓   |    ✓    |   ✓    |
 * | admin  |  ✓   |    ✓    |   ✓    |
 * | member |  ✓   |    ✓    |   ✗    |
 * | viewer |  ✓   |    ✗    |   ✗    |
 *
 * Enforcement primitives every mutation uses:
 *   - operate mutations (create task, post message, submit deliverable, comment, vote,
 *     run an agent, author a skill) gate on `requireRole(ctx, "member")` / `can("operate")`.
 *   - manage mutations (secrets, budgets, governance, environments, plugins, runners, api-keys,
 *     feature flags, kill-switches, agent hire/fire, destructive deletes) gate on
 *     `requireRole(ctx, "admin")`.
 * Proving the matrix here proves it for every mutation that routes through these gates.
 */

const ROLES: WorkspaceRole[] = ["owner", "admin", "member", "viewer"];

function tenancy(role: WorkspaceRole, workspaceId = "ws_matrix"): TenancyContext {
  return { userId: "u_" + role, workspaceId, role, can: (p) => roleCan(role, p) };
}
function ctx(role: WorkspaceRole): GraphQLContext {
  return { tenancy: tenancy(role) } as unknown as GraphQLContext;
}
function denies(role: WorkspaceRole, min: WorkspaceRole): boolean {
  try {
    requireRole(ctx(role), min);
    return false;
  } catch {
    return true;
  }
}

// Representative operate-class permission strings the "operate" cap grants (roles.ts OPERATE_PERMISSIONS).
const OPERATE_PERMS = [
  "operate",
  "task:write", // create a task
  "message:write", // post a message
  "deliverable:write", // submit a deliverable
  "comment:write", // comment
  "vote", // vote on a deliverable
  "agent:run", // run/queue an agent task
  "skill:author",
];

// Representative manage-class permission strings — NOT granted by the operate cap.
const MANAGE_PERMS = [
  "secret:create", // create/rotate a secret
  "budget:write", // set a budget / finance policy
  "delete", // delete a shared resource
  "feature-flag:toggle", // toggle a feature flag
  "governance:manage", // governance / approval policy
  "environment:manage",
  "plugin:install",
  "runner:manage",
  "api-key:create",
  "agent:hire",
  "anything-unknown", // fail-safe: unknown perms are manage-class → members denied
];

describe("RBAC matrix — capability tier (roleCan)", () => {
  it("all roles can read", () => {
    for (const role of ROLES) expect(roleCan(role, "read")).toBe(true);
  });

  it("member and up can OPERATE; viewer cannot", () => {
    for (const perm of OPERATE_PERMS) {
      expect(roleCan("owner", perm)).toBe(true);
      expect(roleCan("admin", perm)).toBe(true);
      expect(roleCan("member", perm)).toBe(true); // member gained operate
      expect(roleCan("viewer", perm)).toBe(false); // viewer stays read-only
    }
  });

  it("only owner/admin can MANAGE; member and viewer cannot (fail-safe on unknown perms)", () => {
    for (const perm of MANAGE_PERMS) {
      expect(roleCan("owner", perm)).toBe(true);
      expect(roleCan("admin", perm)).toBe(true);
      expect(roleCan("member", perm)).toBe(false); // member cannot manage
      expect(roleCan("viewer", perm)).toBe(false);
    }
  });

  it("does not regress existing owner/admin power or the read-only floor", () => {
    expect(roleCan("owner", "anything")).toBe(true);
    expect(roleCan("admin", "delete")).toBe(true);
    // legacy assertion from tenancy.test.ts stays true: bare "write" is not an operate perm
    expect(roleCan("member", "write")).toBe(false);
    expect(roleCan("viewer", "write")).toBe(false);
  });
});

describe("RBAC matrix — server gate tier (requireRole)", () => {
  it("operate gate requireRole('member') admits member+; denies viewer", () => {
    expect(denies("owner", "member")).toBe(false);
    expect(denies("admin", "member")).toBe(false);
    expect(denies("member", "member")).toBe(false); // member CAN operate (create task/message/deliver)
    expect(denies("viewer", "member")).toBe(true); // viewer is read-only
  });

  it("manage gate requireRole('admin') admits admin/owner; denies member+viewer", () => {
    expect(denies("owner", "admin")).toBe(false);
    expect(denies("admin", "admin")).toBe(false);
    expect(denies("member", "admin")).toBe(true); // member CANNOT manage (secret/budget/delete/flag/governance)
    expect(denies("viewer", "admin")).toBe(true);
  });

  it("hierarchy is intact: viewer < member < admin < owner", () => {
    expect(roleAtLeast("member", "viewer")).toBe(true);
    expect(roleAtLeast("member", "member")).toBe(true);
    expect(roleAtLeast("member", "admin")).toBe(false);
    expect(roleAtLeast("admin", "owner")).toBe(false);
    expect(roleAtLeast("owner", "admin")).toBe(true);
  });
});
