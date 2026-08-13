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

/** Canonical capability strings used by the coarse role→capability map. */
export const CAPS = {
  ALL: "*",
  READ: "read",
  OPERATE: "operate",
} as const;

/**
 * Operate-class permission strings — the concrete "do the work" capabilities that the coarse
 * `operate` cap grants. A role holding `operate` (member+) resolves true for any of these; anything
 * NOT listed here (and not an exact cap match) is manage-class and stays owner/admin-only.
 * Fail-safe by design: unknown permission strings default to manage (denied for members).
 */
export const OPERATE_PERMISSION = {
  OPERATE: CAPS.OPERATE,
  TASK_WRITE: "task:write",
  MESSAGE_WRITE: "message:write",
  DELIVERABLE_WRITE: "deliverable:write",
  COMMENT_WRITE: "comment:write",
  VOTE: "vote",
  AGENT_RUN: "agent:run",
  SKILL_AUTHOR: "skill:author",
} as const;

const OPERATE_PERMISSIONS: ReadonlySet<string> = new Set(Object.values(OPERATE_PERMISSION));

/**
 * Coarse capability map per role — the APPROVED team RBAC matrix (docs/RBAC.md §D).
 *
 * Three coarse tiers (we deliberately do NOT model per-action fine-grained perms — that is
 * buildbase's job; here we only gate coarse role tiers):
 *   - `read`    — view workspace data. All roles have it.
 *   - `operate` — do the day-to-day work: create/run tasks, post messages, submit deliverables,
 *                 comment, vote, author skills, run agents/pipelines. Members and up.
 *   - manage    — secrets, budgets/finance, governance/approvals, environments, plugins, runners,
 *                 api-keys, workspace config, feature flags, kill-switches, agent hire/fire,
 *                 destructive deletes of shared resources. Owner/admin only (`"*"`).
 *
 * | role   | caps                 | tier            |
 * | ------ | -------------------- | --------------- |
 * | owner  | `["*"]`              | manage+operate  |
 * | admin  | `["*"]`              | manage+operate  |
 * | member | `["read","operate"]` | operate+read    |
 * | viewer | `["read"]`           | read-only       |
 *
 * When buildbase auth is wired, fine-grained checks defer to buildbase `permissions.resolve`
 * (see docs/gap-plans/01-buildbase-tenancy.md); this map is the safe default.
 */
const ROLE_CAPS: Record<WorkspaceRole, readonly string[]> = {
  owner: [CAPS.ALL],
  admin: [CAPS.ALL],
  member: [CAPS.READ, CAPS.OPERATE],
  viewer: [CAPS.READ],
};

/**
 * True if `role` grants `permission`.
 *   - `"*"` (owner/admin) grants everything.
 *   - an exact cap match grants it (e.g. `read`).
 *   - the `operate` cap grants any operate-class permission (see `OPERATE_PERMISSIONS`).
 * Manage-class permissions are granted only via `"*"`, so members/viewers are denied fail-safe.
 */
export function roleCan(role: WorkspaceRole, permission: string): boolean {
  const caps = ROLE_CAPS[role] ?? [];
  if (caps.includes(CAPS.ALL) || caps.includes(permission)) return true;
  if (caps.includes(CAPS.OPERATE) && OPERATE_PERMISSIONS.has(permission)) return true;
  return false;
}
