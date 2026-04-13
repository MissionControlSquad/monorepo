import { agentModel } from "@/server/models";
import { getTemplate } from "@/server/agent-templates";
import { getConfigBundleForAgent } from "@/server/agent-config-generator";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import type { RouteContext } from "../../../_lib/route-context";

/**
 * GET /api/agents/:id/config-bundle
 * Returns current config files for the agent (admin auth). Used by dashboard "Download files".
 */
export async function GET(_request: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const agent = await agentModel.findById(id);
    if (!agent) return errorResponse("Agent not found", 404);

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
