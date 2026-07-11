import type { GraphQLContext, TenancyContext, WorkspaceRole } from "@agentcenter/graphql-server";
import { roleCan } from "./roles";
import { verifyJWT } from "@/lib/jwt";

/**
 * Pre-buildbase bootstrap workspace id. Existing domain rows are backfilled to this id by the
 * Epic #1 migration on a single-tenant install. Used only when no buildbase workspace token is
 * present (buildbase not yet configured).
 */
export const DEFAULT_WORKSPACE_ID = process.env.DEFAULT_WORKSPACE_ID ?? "ws_default";

/** httpOnly cookie holding the buildbase workspace-scoped JWT (minted by /api/auth/buildbase/workspace-token). */
const WORKSPACE_TOKEN_COOKIE = "bb-workspace-token";

function mapRole(raw: unknown): WorkspaceRole {
  switch (typeof raw === "string" ? raw.toLowerCase() : "") {
    case "owner":
      return "owner";
    case "admin":
      return "admin";
    case "viewer":
      return "viewer";
    default:
      return "member";
  }
}

function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Resolve tenancy from the buildbase workspace-scoped JWT, if present + valid. */
async function fromBuildbaseToken(
  cookieHeader: string | null | undefined,
): Promise<TenancyContext | null> {
  const secret = process.env.SYSTEM_SECRET;
  const token = readCookie(cookieHeader, WORKSPACE_TOKEN_COOKIE);
  if (!secret || !token) return null;

  const claims = await verifyJWT(token, secret);
  if (!claims) return null;

  const userId = typeof claims.userId === "string" ? claims.userId : "";
  const workspaceId = typeof claims.workspaceId === "string" ? claims.workspaceId : "";
  if (!userId || !workspaceId) return null;

  const role = mapRole(claims.userRole);
  return { userId, workspaceId, role, can: (permission: string) => roleCan(role, permission) };
}

/**
 * Resolve per-request human tenancy (Epic #1). Preference order:
 *  1. The buildbase workspace-scoped JWT (`bb-workspace-token` cookie) — real tenancy.
 *  2. Bootstrap fallback: the existing admin session → default workspace as `owner` (until
 *     buildbase credentials are configured).
 * Agents never reach here — they authenticate via apiKeyHash (D2).
 */
export async function resolveTenancy(
  session: GraphQLContext["session"],
  cookieHeader?: string | null,
): Promise<TenancyContext | null> {
  const fromBuildbase = await fromBuildbaseToken(cookieHeader);
  if (fromBuildbase) return fromBuildbase;

  if (!session?.profileId) return null;
  const role: WorkspaceRole = "owner";
  return {
    userId: session.profileId,
    workspaceId: DEFAULT_WORKSPACE_ID,
    role,
    can: (permission: string) => roleCan(role, permission),
  };
}
