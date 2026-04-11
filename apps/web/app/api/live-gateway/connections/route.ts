/**
 * GET /api/live-gateway/connections
 * List all machines that have ever connected (with current status).
 */

import { listLiveGatewayConnections } from "@agentcenter/database";
import { successResponse, handleError } from "../../_lib/json-response";
import { apiLimiters } from "../../_lib/rate-limit-check";
import { resolveSession } from "../../_lib/resolve-session";
import { withFeature } from "../../_lib/with-feature";
import { withRateLimit } from "../../_lib/with-rate-limit";
import { FLAG_KEYS } from "@agentcenter/utils";

async function getHandler(request: Request) {
  try {
    await resolveSession(request);

    const connections = await listLiveGatewayConnections();

    return successResponse({
      connections: connections.map((c) => ({
        id: c.id,
        machineName: c.machineName,
        connectionStatus: c.connectionStatus,
        connectedAt: c.connectedAt,
        lastDisconnectedAt: c.lastDisconnectedAt,
        pluginVersion: c.pluginVersion,
        agentSlugs: c.agentRoutes.map((r) => r.agentSlug),
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

export const GET = withRateLimit(
  apiLimiters.liveGatewayConnections,
  withFeature(FLAG_KEYS.LIVE_GATEWAY, getHandler),
);
