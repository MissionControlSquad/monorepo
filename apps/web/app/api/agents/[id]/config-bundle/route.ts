import { agentModel } from "@/server/models";
import { getTemplate } from "@/server/agent-templates";
import { getConfigBundleForAgent } from "@/server/agent-config-generator";
import { successResponse, handleError, assertFound } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import type { RouteContext } from "../../../_lib/route-context";

/**
 * GET /api/agents/:id/config-bundle
 * Returns current config files for the agent (admin auth). Used by dashboard "Download files".
 */
export async function GET(_request: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const agent = await agentModel.findById(id);
    assertFound(agent, ERR.AGENT_NOT_FOUND);

    const template = agent.templateId ? getTemplate(agent.templateId) : undefined;
    const bundle = getConfigBundleForAgent({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      username: agent.username,
      identityEmoji: agent.identityEmoji,
      personality: agent.personality,
      level: agent.level,
      templateId: agent.templateId,
      capabilities: template?.capabilities,
    });
    return successResponse(bundle);
  } catch (err) {
    return handleError(err);
  }
}
