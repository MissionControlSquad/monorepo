"use client";

import type { ReactNode } from "react";
import { WhenWorkspaceRoles } from "@buildbase/sdk/react";
import { WORKSPACE_ROLES } from "@agentcenter/utils";
import { useBuildbaseReady } from "@/components/providers/BuildbaseProvider";

// Human-RBAC gate for user-facing admin UI, backed by buildbase workspace roles (owner/admin).
// This formalizes the human side of RBAC on buildbase — the agent side (agent-authz) stays in the
// monorepo. See the AI-vs-user split in .paperclip-parity/BUILDBASE-PLAN.mdx.
//
// Dormant-safe: until buildbase is provisioned (BuildbaseReady=false), it does NOT client-restrict —
// children render and server-side enforcement (ctx.tenancy.userRole in GraphQL mutations) remains
// the security floor, so wrapping UI in <WhenAdmin> can never regress current behavior. Once
// provisioned, it restricts to workspace owner/admin.

const ADMIN_ROLES = [WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN];

export function WhenAdmin({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const ready = useBuildbaseReady();
  if (!ready) return <>{children}</>;
  return (
    <WhenWorkspaceRoles roles={ADMIN_ROLES} fallback={fallback}>
      {children}
    </WhenWorkspaceRoles>
  );
}
