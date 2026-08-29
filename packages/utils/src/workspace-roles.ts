/**
 * Canonical workspace-role vocabulary — the SINGLE source of truth for the human-tenancy role names
 * (buildbase workspace roles, Epic #1). Lives in `@agentcenter/utils` (client-safe: no server deps) so
 * BOTH server code (graphql-server, tenancy, services — which re-export it) AND client components
 * (WhenAdmin, BuildbaseProvider) consume the same constant instead of hardcoding `"owner"`/`"admin"`/…
 * string literals. `@agentcenter/graphql-server` re-exports these for back-compat with existing imports.
 */

/** Workspace-level role of the current human, resolved from buildbase. */
export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

/** Canonical workspace-role values. Use instead of raw string literals at every call site. */
export const WORKSPACE_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
  VIEWER: "viewer",
} as const satisfies Record<string, WorkspaceRole>;
