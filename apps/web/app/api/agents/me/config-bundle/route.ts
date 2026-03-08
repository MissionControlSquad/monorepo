import { resolveAgent } from "../../../_lib/resolve-agent";
import { successResponse, handleError } from "../../../_lib/json-response";
import { log } from "../../../_lib/logger";
import { getConfigBundleForAgent } from "@/server/agent-config-generator";
import { getTemplate } from "@/server/agent-templates";

/**
 * GET /api/agents/me/config-bundle
 * Returns current config files (HEARTBEAT, PLAYBOOK, etc.) for the authenticated agent.
 * Agent can compare with local files and apply updates. Uses $API_KEY placeholder in files.
 */
export async function GET(request: Request) {
  try {
    const agent = await resolveAgent(request);
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
    log(
      "config-bundle",
      `agent="${agent.name}" template=${agent.templateId ?? "none"} files=${Object.keys(bundle.files ?? bundle).length}`,
      request,
    );
    return successResponse(bundle);
  } catch (err) {
    return handleError(err);
  }
}
