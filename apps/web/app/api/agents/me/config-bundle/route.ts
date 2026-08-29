import { withAgent } from "../../../_lib/with-agent";
import { successResponse } from "../../../_lib/json-response";
import { log } from "../../../_lib/logger";
import { getConfigBundleForAgent } from "@/server/agent-config-generator";
import { getTemplate } from "@/server/agent-templates";

/**
 * GET /api/agents/me/config-bundle
 * Returns current config files (HEARTBEAT, PLAYBOOK, etc.) for the authenticated agent.
 * Agent can compare with local files and apply updates. Uses $API_KEY placeholder in files.
 */
export const GET = withAgent(async (request, agent) => {
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
});
