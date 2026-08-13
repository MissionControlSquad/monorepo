import {
  ensureUserAndProfileForBuildbase,
  provisionFirstBuildbaseOwner,
} from "@agentcenter/database";
import { createSessionToken } from "@/server/admin-auth";
import { createJWT } from "@/lib/jwt";
import { getBuildbase } from "@/server/tenancy/buildbase";

/**
 * Auth bridge — buildbase session → mc_session, GATED BY buildbase WORKSPACE MEMBERSHIP.
 *
 * ── CROSS-TENANT THREAT MODEL (the load-bearing property) ───────────────────────────────────────
 * Each tenant dashboard is its own container bound to its OWN buildbase workspace, whose id infra
 * injects as `process.env.TENANT_WORKSPACE_ID`. The `bb-session-id` cookie is shared across every
 * *.agentcenter.cloud host (that is what enables landing→dashboard SSO), so ANY authenticated
 * buildbase user's session physically reaches EVERY tenant container. buildbase only asserts "this is
 * user X, who belongs to workspaces [...] with roles [...]" — it does not bind a tenant. Therefore the
 * bridge MUST verify, against buildbase, that the user is a MEMBER of THIS container's bound workspace
 * (TENANT_WORKSPACE_ID) before minting any app session. A non-member is DENIED — no mc_session, no
 * workspace token — so user B can never enter tenant A with a valid shared-cookie session. Fail-closed.
 *
 * ── WHAT A GRANT ESTABLISHES ────────────────────────────────────────────────────────────────────
 * On success the bridge mints BOTH:
 *   • mc_session  — the app session the middleware trusts (authenticated identity + actor Profile).
 *   • bb-workspace-token — pinned to TENANT_WORKSPACE_ID with the buildbase-reported role
 *     (owner/admin/member/viewer). resolveTenancy() reads this; capability is governed per-mutation by
 *     that role (D3 RBAC). The bridge never fabricates a role and never auto-grants platform-admin —
 *     owner is only provisioned when buildbase reports role "owner" for this workspace.
 *
 * ── SELF-HOST ───────────────────────────────────────────────────────────────────────────────────
 * When TENANT_WORKSPACE_ID is UNSET (self-host / single-tenant / local dev / test), there is no
 * membership plane to enforce: any authenticated buildbase user is allowed and tenancy uses the
 * existing DEFAULT_WORKSPACE_ID fallback in resolveTenancy. Preserves self-host + local testing.
 *
 * Callers (both must have ALREADY verified the buildbase session):
 *   1. /api/auth/buildbase/token — after the OAuth code→token exchange.
 *   2. /api/auth/buildbase/sso   — after validating an existing bb-session-id (auto-SSO).
 */

export type WorkspaceRoleName = "owner" | "admin" | "member" | "viewer";

export interface BuildbaseBridgeUser {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
}

export type BridgeOutcome =
  | {
      status: "granted";
      mcToken: string;
      workspaceToken: string; // "" in self-host (no bound workspace to pin)
      profileId: string;
      workspaceId: string; // "" in self-host
      role: WorkspaceRoleName;
      buildbaseUserId: string;
    }
  | { status: "denied"; reason: "no-identity" | "not-a-member" | "misconfigured" };

/** This container's bound buildbase workspace, or null in self-host. */
function tenantWorkspaceId(): string | null {
  return (process.env.TENANT_WORKSPACE_ID ?? "").trim() || null;
}

function normalizeRole(raw: unknown): WorkspaceRoleName {
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

/**
 * App capability tier implied by a buildbase role — documentation/telemetry only, NOT stored in
 * mc_session and NOT an app-admin grant. Real enforcement is per-mutation against the workspace role.
 */
export function roleFromBuildbase(role?: string | null): "manage" | "member" {
  const r = normalizeRole(role);
  return r === "owner" || r === "admin" ? "manage" : "member";
}

/**
 * Verify (against buildbase) that the session's user is a member of the bound workspace, and resolve
 * their role there. Returns null when NOT a member / on any error (fail-closed). buildbase gates
 * workspace.list() by membership, so mere presence of TENANT_WORKSPACE_ID in the result proves it.
 */
async function verifyWorkspaceMembership(
  sessionId: string,
  workspaceId: string,
  buildbaseUserId: string,
): Promise<WorkspaceRoleName | null> {
  const bb = getBuildbase();
  if (!bb) return null;

  let workspaces: Awaited<ReturnType<ReturnType<typeof bb.withSession>["workspace"]["list"]>>;
  try {
    workspaces = await bb.withSession(sessionId).workspace.list();
  } catch {
    return null; // buildbase refused / network error → treat as not-a-member (fail-closed)
  }

  const ws = workspaces.find((w) => w?._id === workspaceId || w?.workspaceId === workspaceId);
  if (!ws) return null; // not a member of THIS tenant's workspace → deny

  // buildbase returns parallel users[]/roles[] arrays; resolve this user's role (least-privilege
  // "member" default when unresolved).
  const users = Array.isArray(ws.users) ? ws.users : [];
  const roles = Array.isArray(ws.roles) ? ws.roles : [];
  const idx = users.findIndex((u) => {
    const id = (u as { _id?: string; id?: string })?._id ?? (u as { id?: string })?.id;
    return id === buildbaseUserId;
  });
  return normalizeRole(idx >= 0 ? roles[idx] : undefined);
}

/**
 * Bridge a verified buildbase session into an app session — ONLY if the user is a member of this
 * container's bound workspace. Returns a granted outcome (with both tokens) or a denied outcome.
 */
export async function bridgeBuildbaseSession(input: {
  sessionId: string;
  user: BuildbaseBridgeUser;
}): Promise<BridgeOutcome> {
  const buildbaseUserId = (input.user.id ?? "").trim();
  if (!buildbaseUserId) return { status: "denied", reason: "no-identity" };

  const workspaceId = tenantWorkspaceId();

  // ── Hosted multi-tenant: membership of the bound workspace is REQUIRED. ──
  if (workspaceId) {
    const systemSecret = process.env.SYSTEM_SECRET;
    if (!systemSecret) return { status: "denied", reason: "misconfigured" };

    const role = await verifyWorkspaceMembership(input.sessionId, workspaceId, buildbaseUserId);
    if (!role) return { status: "denied", reason: "not-a-member" };

    const { userId, profileId } = await ensureUserAndProfileForBuildbase({
      buildbaseUserId,
      email: input.user.email ?? null,
      name: input.user.name ?? null,
    });

    // Owner bootstrap is constrained to the user buildbase reports as the workspace OWNER — never a
    // random visitor (idempotent: no-op once any owner exists).
    if (role === "owner") {
      try {
        await provisionFirstBuildbaseOwner(
          userId,
          input.user.email || input.user.name || buildbaseUserId,
        );
      } catch {
        // Non-fatal: the ownership marker is best-effort and must not block a verified member.
      }
    }

    const username =
      (input.user.email ?? "").trim() || (input.user.name ?? "").trim() || buildbaseUserId;
    const mcToken = await createSessionToken({ sub: buildbaseUserId, username, profileId });
    const workspaceToken = await createJWT(
      { userId: buildbaseUserId, workspaceId, userRole: role, email: input.user.email || "" },
      systemSecret,
    );

    return {
      status: "granted",
      mcToken,
      workspaceToken,
      profileId,
      workspaceId,
      role,
      buildbaseUserId,
    };
  }

  // ── Self-host single-tenant (TENANT_WORKSPACE_ID unset): no membership plane. resolveTenancy's
  //    DEFAULT_WORKSPACE_ID fallback grants tenancy. Mint mc_session only; nothing to pin. ──
  const { userId, profileId } = await ensureUserAndProfileForBuildbase({
    buildbaseUserId,
    email: input.user.email ?? null,
    name: input.user.name ?? null,
  });
  try {
    // First authenticated user of a single-tenant install becomes the local owner (idempotent).
    await provisionFirstBuildbaseOwner(
      userId,
      input.user.email || input.user.name || buildbaseUserId,
    );
  } catch {
    // best-effort
  }
  const username =
    (input.user.email ?? "").trim() || (input.user.name ?? "").trim() || buildbaseUserId;
  const mcToken = await createSessionToken({ sub: buildbaseUserId, username, profileId });
  return {
    status: "granted",
    mcToken,
    workspaceToken: "",
    profileId,
    workspaceId: "",
    role: normalizeRole(input.user.role),
    buildbaseUserId,
  };
}
