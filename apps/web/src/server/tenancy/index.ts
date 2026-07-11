/**
 * Tenancy layer (Epic #1) — bridges the buildbase SaaS plane (humans) to the AgentCenter domain
 * plane via `ctx.tenancy` + `workspaceId`. See docs/gap-plans/01-buildbase-tenancy.md and
 * .claude/skills/buildbase-tenancy.
 */
export { roleAtLeast, roleCan } from "./roles";
export { resolveTenancy, DEFAULT_WORKSPACE_ID } from "./resolve";
export { requireTenancy, requireRole, requirePermission, scoped } from "./guards";
