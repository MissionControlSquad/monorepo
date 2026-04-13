/**
 * DELETE /api/live-gateway/connections/[id]
 * Remove a machine connection record. Only allowed when the machine is offline.
 */

import { deleteLiveGatewayConnection, listLiveGatewayConnections } from "@agentcenter/database";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { resolveSession } from "../../../_lib/resolve-session";
import { connectionRegistry } from "@/server/services/live-connection-registry";
import { apiLimiters } from "../../../_lib/rate-limit-check";
import { withFeature } from "../../../_lib/with-feature";
import { withRateLimit } from "../../../_lib/with-rate-limit";
import { FLAG_KEYS } from "@agentcenter/utils";
import type { RouteContext } from "../../../_lib/route-context";

async function deleteHandler(request: Request, ctx: RouteContext) {
  try {
    await resolveSession(request);

    const { id } = await ctx.params;

    // Refuse to delete a currently live connection — must disconnect first.
    if (connectionRegistry.has(id)) {
      return errorResponse("Machine is currently connected. Disconnect it first.", 409);
    }

    // Confirm the record exists before deleting.
    const connections = await listLiveGatewayConnections();
    const conn = connections.find((c) => c.id === id);
    if (!conn) return errorResponse("Connection not found", 404);

    await deleteLiveGatewayConnection(id);
    return successResponse({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

export const DELETE = withRateLimit(
  apiLimiters.liveGatewayConnections,
  withFeature(FLAG_KEYS.LIVE_GATEWAY, deleteHandler),
);
