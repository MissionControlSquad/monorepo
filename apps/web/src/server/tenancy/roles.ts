import type { WorkspaceRole } from "@agentcenter/graphql-server";

/**
 * Workspace role ordering. Higher rank = more capability.
 * Mirrors buildbase workspace roles (D1). Shared-workspace model (D3): role gates
 * view-vs-manage across the whole workspace; there is no per-object ACL.
 */
const RANK: Record<WorkspaceRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

/** True if `role` is at least `min` in the workspace-role hierarchy. */
export function roleAtLeast(role: WorkspaceRole, min: WorkspaceRole): boolean {
  return RANK[role] >= RANK[min];
}

/**
 * Coarse capability map per role. `owner`/`admin` manage everything; `member`/`viewer` read.
 * When buildbase auth is wired, fine-grained checks defer to buildbase `permissions.resolve`
 * (see docs/gap-plans/01-buildbase-tenancy.md); this map is the safe default.
 */
const ROLE_CAPS: Record<WorkspaceRole, readonly string[]> = {
  owner: ["*"],
  admin: ["*"],
  member: ["read"],
  viewer: ["read"],
};

/** True if `role` grants `permission` (`"*"` grants all). */
export function roleCan(role: WorkspaceRole, permission: string): boolean {
  const caps = ROLE_CAPS[role] ?? [];
  return caps.includes("*") || caps.includes(permission);
}
