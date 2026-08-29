import { agentModel } from "@/server/models";
import { generateApiKey } from "@/server/api-key";
import { withTenancy } from "../../../_lib/rest-tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { successResponse, handleError, assertFound } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { invalidateAgentCache } from "@/server/cache";
import type { RouteContext } from "../../../_lib/route-context";

/**
 * POST /api/agents/:id/regenerate-key
 * Generates a new API key, invalidating the old one. Human ADMIN only — minting a fresh agent key is a
 * manage-class action (previously this route had NO auth at all). Agents live in this tenant's own
 * isolated database, so an id lookup can't cross tenants; withTenancy enforces the human admin gate.
 */
export const POST = withTenancy(
  async (_request, _tenancy, ctx: RouteContext) => {
    try {
      const { id } = await ctx.params;

      const agent = await agentModel.findById(id);
      assertFound(agent, ERR.AGENT_NOT_FOUND);

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
  },
  { minRole: WORKSPACE_ROLES.ADMIN },
);
