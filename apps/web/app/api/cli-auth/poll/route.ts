import { pollCliAuth } from "@/server/services/cli-auth";
import { successResponse, errorResponse } from "../../_lib/json-response";

/**
 * POST /api/cli-auth/poll — device side, no session. The CLI polls with its deviceCode.
 * Body: { deviceCode: string }. Returns { status, apiKey? }. The apiKey is present exactly once,
 * on the first poll after the user approves the challenge.
 */
export async function POST(request: Request) {
  let body: { deviceCode?: string };
  try {
    body = (await request.json()) as { deviceCode?: string };
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }
  if (!body.deviceCode) return errorResponse("deviceCode is required", 400);

  const result = await pollCliAuth(body.deviceCode);
  if (result.status === "not_found") return errorResponse("Unknown device code", 404);
  return successResponse(result);
}
