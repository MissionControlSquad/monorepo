/**
 * DELETE /api/live-gateway/tokens/[id] — revoke an install token
 */

import { revokeLiveGatewayToken } from "@agentcenter/database";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { apiLimiters } from "../../../_lib/rate-limit-check";
import { resolveSession } from "../../../_lib/resolve-session";
import { withFeature } from "../../../_lib/with-feature";
import { withRateLimit } from "../../../_lib/with-rate-limit";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { RouteContext } from "../../../_lib/route-context";

async function deleteHandler(request: Request, ctx: RouteContext) {
  try {
    await resolveSession(request);

    const { id } = await ctx.params;
    if (!id) return errorResponse("Missing token id", 400);

    await revokeLiveGatewayToken(id);
    return successResponse({ revoked: true });
  } catch (err) {
    return handleError(err);
  }
}

export const DELETE = withRateLimit(
  apiLimiters.liveGatewayTokens,
  withFeature(FLAG_KEYS.LIVE_GATEWAY, deleteHandler),
);
