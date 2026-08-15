import { NextResponse } from "next/server";
import { adminUserModel } from "@/server/models";
import { getLicenseStatus } from "@/server/license";
import { tenantWorkspaceId } from "@/server/auth/buildbase-bridge";

export async function GET() {
  const adminCount = await adminUserModel.count();
  const license = await getLicenseStatus();

  return NextResponse.json(
    {
      setupComplete: adminCount > 0,
      license: {
        status: license.status,
        plan: license.plan,
        org: license.org,
        expiresAt: license.expiresAt,
      },
      // The buildbase workspace this container is bound to (server-only env; exposed here so the client
      // can PIN the SDK's currentWorkspace to it — otherwise the settings/billing modal shows the user's
      // default workspace, identical on every tenant). null ⇒ self-host / unbound (no pinning).
      boundWorkspaceId: tenantWorkspaceId(),
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
