import type { GraphQLContext, TenancyContext, WorkspaceRole } from "@agentcenter/graphql-server";
import { roleCan } from "./roles";

/**
 * Pre-buildbase bootstrap workspace id. Every existing domain row is backfilled to this id by the
 * Epic #1 migration on a single-tenant install. Once buildbase auth is wired, the real buildbase
 * workspace `_id` flows through the session instead of this constant.
 */
export const DEFAULT_WORKSPACE_ID = process.env.DEFAULT_WORKSPACE_ID ?? "ws_default";

/**
 * Resolve per-request human tenancy from the session.
 *
 * BOOTSTRAP implementation (Epic #1, slice 1): the existing single admin session maps to the
 * default workspace as `owner`. When the buildbase auth routes land (slice: buildbase wiring), this
 * reads `{ userId, workspaceId, role }` from the workspace-scoped session/JWT that
 * `/api/auth/workspace-token` mints — see docs/gap-plans/01-buildbase-tenancy.md and the website's
 * BuildbaseProvider. Agents never reach here (they authenticate via apiKeyHash — D2).
 */
export function resolveTenancy(session: GraphQLContext["session"]): TenancyContext | null {
  if (!session?.profileId) return null;

  // TODO(buildbase-auth): read workspaceId + role from the workspace-scoped JWT once wired.
  const workspaceId = DEFAULT_WORKSPACE_ID;
  const role: WorkspaceRole = "owner";

  return {
    userId: session.profileId,
    workspaceId,
    role,
    can: (permission: string) => roleCan(role, permission),
  };
}
