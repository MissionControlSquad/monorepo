import { GraphQLError } from "graphql";
import type { GraphQLContext, TenancyContext, WorkspaceRole } from "@agentcenter/graphql-server";
import { roleAtLeast } from "./roles";

/** Throw UNAUTHENTICATED if there is no human tenancy on the request. */
export function requireTenancy(ctx: GraphQLContext): TenancyContext {
  if (!ctx.tenancy) {
    throw new GraphQLError("Not authenticated", { extensions: { code: "UNAUTHENTICATED" } });
  }
  return ctx.tenancy;
}

/** Throw FORBIDDEN unless the caller's workspace role is at least `min`. Returns the tenancy. */
export function requireRole(ctx: GraphQLContext, min: WorkspaceRole): TenancyContext {
  const tenancy = requireTenancy(ctx);
  if (!roleAtLeast(tenancy.role, min)) {
    throw new GraphQLError(`Requires '${min}' role`, {
      extensions: { code: "FORBIDDEN", required: min, actual: tenancy.role },
    });
  }
  return tenancy;
}

/** Throw FORBIDDEN unless the caller's role grants `permission`. Returns the tenancy. */
export function requirePermission(ctx: GraphQLContext, permission: string): TenancyContext {
  const tenancy = requireTenancy(ctx);
  if (!tenancy.can(permission)) {
    throw new GraphQLError(`Missing permission: ${permission}`, {
      extensions: { code: "FORBIDDEN", permission },
    });
  }
  return tenancy;
}

/**
 * Inject the caller's `workspaceId` into a Prisma `where`, enforcing workspace isolation (D5).
 * Every workspace-scoped read MUST build its filter through this helper so a query can never
 * return another workspace's rows.
 */
export function scoped<T extends Record<string, unknown>>(
  ctx: GraphQLContext,
  where?: T,
): T & { workspaceId: string } {
  const tenancy = requireTenancy(ctx);
  return { ...(where ?? ({} as T)), workspaceId: tenancy.workspaceId };
}
