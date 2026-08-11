"use client";

import type { ReactNode } from "react";
import { WhenPermission as SdkWhenPermission } from "@buildbase/sdk/react";
import { useBuildbaseReady } from "@/components/providers/BuildbaseProvider";
import { WhenAdmin } from "@/components/auth/WhenAdmin";

// Finer-grained, buildbase-backed permission gate for the HUMAN layer. Where the app currently gates
// only on owner/admin (<WhenAdmin>), this reflects the real platform permission
// (e.g. Permission.WORKSPACE_BILLING_MANAGE, WORKSPACE_MEMBERS_INVITE) once buildbase is provisioned.
//
// Dormant-safe by construction: until buildbase is provisioned (BuildbaseReady=false), usePermissions
// has no data, so we DON'T use the SDK check — we fall back to <WhenAdmin>, which itself does not
// client-restrict while dormant (server-side ctx.tenancy enforcement stays the security floor). Once
// provisioned, we restrict to the exact permission(s). This never loosens an existing gate: dormant
// behavior is identical to wrapping in <WhenAdmin>, and provisioned behavior is stricter (a specific
// permission rather than "any admin"). Pass the same `fallback` you'd pass to <WhenAdmin>.

export function WhenPermission({
  permission,
  children,
  fallback = null,
}: {
  /** A platform permission string (use the SDK `Permission` const map) or an array (any-of). */
  permission: string | string[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const ready = useBuildbaseReady();
  if (!ready) {
    // Not provisioned → match the existing owner/admin fallback (which renders children when dormant).
    return <WhenAdmin fallback={fallback}>{children}</WhenAdmin>;
  }
  return (
    <SdkWhenPermission permission={permission} fallback={fallback}>
      {children}
    </SdkWhenPermission>
  );
}
