import { agentModel } from "@/server/models";
import { generateApiKey } from "@/server/api-key";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { invalidateAgentCache } from "@/server/cache";
import type { RouteContext } from "../../../_lib/route-context";

/**
 * POST /api/agents/:id/regenerate-key
 * Generates a new API key, invalidating the old one.
 */
export async function POST(_request: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;

    const agent = await agentModel.findById(id);
    if (!agent) return errorResponse(ERR.AGENT_NOT_FOUND, 404);

    // Invalidate cached entry for the old API key
    if (agent.apiKeyHash) invalidateAgentCache(agent.apiKeyHash);

    const { plainKey, hash, prefix } = generateApiKey();

    await agentModel.update(id, {
      data: {
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
        apiKeyCreatedAt: new Date(),
      },
    });

    return successResponse({
      apiKey: plainKey,
      apiKeyPrefix: prefix,
      message: "API key regenerated. The old key is now invalid.",
    });
  } catch (err) {
    return handleError(err);
  }
}
