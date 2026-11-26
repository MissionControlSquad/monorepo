import { NextResponse } from "next/server";
import { adminUserModel } from "@/server/models";
import { getLicenseStatus } from "@/server/license";

export async function GET() {
  const adminCount = await adminUserModel.count();
  const license = getLicenseStatus();

  return NextResponse.json(
    {
      setupComplete: adminCount > 0,
      license: {
        status: license.status,
        plan: license.plan,
        org: license.org,
        expiresAt: license.expiresAt,
      },
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
