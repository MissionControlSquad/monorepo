export const dynamic = "force-dynamic";

import {
  getLicenseStatus,
  activateLicenseKey,
  clearStoredLicense,
  invalidateLicenseCache,
} from "@/server/license";
import { createRateLimiter } from "@/server/rate-limit";
import { checkRateLimit } from "../_lib/rate-limit-check";

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

/** DELETE /api/license — Deactivate / remove license */
export async function DELETE() {
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
