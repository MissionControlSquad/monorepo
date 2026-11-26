export const dynamic = "force-dynamic";

import { getLicenseStatus } from "@/server/license";

/**
 * GET /api/license — always reports an active, unlimited install.
 *
 * Kept for older desktop and mobile clients that check it before showing the app. License keys
 * no longer exist, so activation (POST) and deactivation (DELETE) are gone; Next.js answers
 * those methods with 405.
 */
export function GET() {
  return Response.json(getLicenseStatus());
}
