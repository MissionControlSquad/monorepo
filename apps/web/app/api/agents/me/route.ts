import { withAgent } from "../../_lib/with-agent";
import { successResponse } from "../../_lib/json-response";
import { log } from "../../_lib/logger";
import { CURRENT_CONFIG_VERSION } from "@/server/config-version";
import { isSystemShutdown } from "@/server/system-settings";

/** Omit sensitive fields from agent before sending to client. */
function toSafeAgentPayload(agent: Record<string, unknown>) {
  const { apiKeyHash, apiKeyCreatedAt, ...rest } = agent;
  return rest;
}

export const GET = withAgent(async (request, agent) => {
  const currentConfigVersion = CURRENT_CONFIG_VERSION;
  const upgradeAvailable =
    agent.configVersion == null || agent.configVersion !== currentConfigVersion;
  const systemShutdown = await isSystemShutdown();
  const payload = toSafeAgentPayload(agent as Record<string, unknown>);
  log(
    "agents/me",
    `agent="${agent.name}" configVersion=${agent.configVersion ?? "null"} upgradeAvailable=${upgradeAvailable} shutdown=${systemShutdown}`,
    request,
  );
  return successResponse({
    ...payload,
    currentConfigVersion,
    upgradeAvailable,
    systemShutdown,
  });
});
