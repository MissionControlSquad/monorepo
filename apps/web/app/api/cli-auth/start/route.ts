import { startCliAuth } from "@/server/services/cli-auth";
import { successResponse, errorResponse } from "../../_lib/json-response";

/**
 * POST /api/cli-auth/start — device side, no session. A CLI begins a device-authorization challenge.
 * Body: { keyName?: string }. Returns { deviceCode, userCode, verificationUrl, expiresAt }.
 * The CLI shows userCode + verificationUrl to the user and then polls /api/cli-auth/poll.
 */
export async function POST(request: Request) {
  let body: { keyName?: string } = {};
  try {
    body = (await request.json()) as { keyName?: string };
  } catch {
    // empty body is fine — defaults apply
  }

  try {
    const { deviceCode, userCode, expiresAt } = await startCliAuth(body.keyName ?? "CLI");
    const origin = new URL(request.url).origin;
    return successResponse({
      deviceCode,
      userCode,
      verificationUrl: `${origin}/cli-auth`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch {
    return errorResponse("Failed to start CLI authorization", 500);
  }
}
