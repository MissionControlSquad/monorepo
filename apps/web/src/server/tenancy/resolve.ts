import type { GraphQLContext, TenancyContext, WorkspaceRole } from "@agentcenter/graphql-server";
import { roleCan } from "./roles";
import { verifyJWT } from "@/lib/jwt";
import { FLAG_KEYS } from "@agentcenter/utils";
import { isFeatureEnabled } from "@/server/feature-flags";
import { verifyApiKey } from "@/server/services/api-keys";

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

  // Belt-and-suspenders: in a bound (hosted) tenant, refuse any workspace-token whose workspaceId isn't
  // the bound one. The switch-block route + auth bridge only ever mint tokens pinned to
  // TENANT_WORKSPACE_ID, so a mismatch means a STALE cookie — e.g. a tenant that was migrated from
  // unbound (email-keyed) to bound (set-workspace) while a user still held a 7-day bb-workspace-token
  // carrying the old workspaceId. Returning null here fails closed → resolveTenancy falls through to the
  // bound-fallback refusal, and the client re-mints a correctly-pinned token on the next workspace event.
  const bound = process.env.TENANT_WORKSPACE_ID?.trim();
  if (bound && workspaceId !== bound) return null;

  const role = mapRole(claims.userRole);
  return { userId, workspaceId, role, can: (permission: string) => roleCan(role, permission) };
}

/**
 * Resolve tenancy from an `Authorization: Bearer mc_…` API key (Epic #12). Programmatic/CLI access.
 * The key authenticates as least-privilege `member` (a leaked key must not wield admin), scoped to the
 * key's workspace, attributed to the minting profile. Gated by the API_KEYS flag as an admin
 * kill-switch — disabling the feature immediately stops key auth.
 */
async function fromApiKey(authHeader: string | null | undefined): Promise<TenancyContext | null> {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(mc_[A-Za-z0-9]+)$/);
  if (!match) return null;
  if (!(await isFeatureEnabled(FLAG_KEYS.API_KEYS))) return null;

  const verified = await verifyApiKey(match[1]);
  if (!verified) return null;

  const role: WorkspaceRole = "member";
  return {
    userId: verified.createdByProfileId ?? `apikey_${verified.apiKeyId}`,
    workspaceId: verified.workspaceId,
    role,
    can: (permission: string) => roleCan(role, permission),
  };
}

/**
 * Resolve per-request tenancy. Preference order:
 *  1. An `Authorization: Bearer mc_…` API key (Epic #12) — programmatic/CLI access as `member`.
 *  2. The buildbase workspace-scoped JWT (`bb-workspace-token` cookie) — real human tenancy.
 *  3. Bootstrap fallback: the existing admin session → default workspace as `owner` (until
 *     buildbase credentials are configured).
 * Agents never reach here — they authenticate via apiKeyHash (D2).
 */
export async function resolveTenancy(
  session: GraphQLContext["session"],
  cookieHeader?: string | null,
  authHeader?: string | null,
): Promise<TenancyContext | null> {
  const fromKey = await fromApiKey(authHeader);
  if (fromKey) return fromKey;

  const fromBuildbase = await fromBuildbaseToken(cookieHeader);
  if (fromBuildbase) return fromBuildbase;

  // Bootstrap fallback: mc_session → DEFAULT_WORKSPACE_ID as owner.
  //
  // SECURITY: this fallback is ONLY safe for a single-tenant / self-host install and the test harness.
  // In a hosted multi-tenant container (TENANT_WORKSPACE_ID set), the `bb-session-id` cookie is shared
  // across all *.agentcenter.cloud hosts, so an authenticated-but-non-member user could otherwise be
  // silently granted OWNER of the default workspace — a cross-tenant breach. When this container is
  // bound to a workspace we therefore REFUSE the fallback: a verified member always carries a
  // bb-workspace-token pinned to TENANT_WORKSPACE_ID (resolved above by fromBuildbaseToken); a
  // non-member is denied at the auth bridge and never obtains that token. Fail-closed → null.
  if (process.env.TENANT_WORKSPACE_ID?.trim()) return null;

  if (!session?.profileId) return null;
  const role: WorkspaceRole = "owner";
  return {
    userId: session.profileId,
    workspaceId: DEFAULT_WORKSPACE_ID,
    role,
    can: (permission: string) => roleCan(role, permission),
  };
}
