export const dynamic = "force-dynamic";

import {
  getLicenseStatus,
  activateLicenseKey,
  clearStoredLicense,
  invalidateLicenseCache,
} from "@/server/license";
import { createRateLimiter } from "@/server/rate-limit";
import { checkRateLimit } from "../_lib/rate-limit-check";
import { resolveRestTenancy } from "../_lib/rest-tenancy";
import { roleAtLeast } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";

/** License activation — tight limit to prevent brute-force */
const activateLimiter = createRateLimiter({ max: 5, windowSec: 60, prefix: "rl:lic:activate" });

/** GET /api/license — Check current license status */
export async function GET() {
  try {
    const status = await getLicenseStatus();
    return Response.json(status);
  } catch {
    return Response.json({ status: "none", message: "Unable to check license" }, { status: 500 });
  }
}

/** POST /api/license — Activate a license key */
export async function POST(request: Request) {
  const blocked = await checkRateLimit(activateLimiter, request);
  if (blocked) return blocked;

  try {
    const { key } = await request.json();

    if (!key || typeof key !== "string" || key.trim().length < 10) {
      return Response.json(
        { success: false, message: "Please enter a valid license key" },
        { status: 400 },
      );
    }

    const result = await activateLicenseKey(key.trim());
    invalidateLicenseCache();

    if (!result.success) {
      return Response.json(result, { status: 400 });
    }

    return Response.json(result);
  } catch {
    return Response.json(
      { success: false, message: "Activation failed. Please try again." },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/license — Deactivate / remove license.
 *
 * /api/license is in the middleware PUBLIC allowlist so first-run GET (status) + POST (activation) work
 * before any session exists. DELETE, however, de-licenses the instance — and since every agent operation
 * gates on isLicenseActive(), an anonymous DELETE would remotely disable the whole agent plane (DoS). So
 * gate it in-handler: require an authenticated workspace admin/owner. Agents (mc_ API keys resolve to
 * least-privilege "member") and anonymous callers are refused.
 */
export async function DELETE(request: Request) {
  const tenancy = await resolveRestTenancy(request);
  if (!tenancy) {
    return Response.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!roleAtLeast(tenancy.role, WORKSPACE_ROLES.ADMIN)) {
    return Response.json({ success: false, message: "Forbidden" }, { status: 403 });
  }
  try {
    await clearStoredLicense();
    invalidateLicenseCache();
    return Response.json({ success: true, message: "License deactivated" });
  } catch {
    return Response.json(
      { success: false, message: "Failed to deactivate license" },
      { status: 500 },
    );
  }
}
