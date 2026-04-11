/**
 * DELETE /api/live-gateway/tokens/[id] — revoke an install token
 */

import { revokeInstallToken } from "@agentcenter/database";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { resolveSession } from "../../../_lib/resolve-session";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, ctx: RouteContext) {
  try {
    await resolveSession(request);

    const { id } = await ctx.params;
    if (!id) return errorResponse("Missing token id", 400);

    await revokeInstallToken(id);
    return successResponse({ revoked: true });
  } catch (err) {
    return handleError(err);
  }
}
