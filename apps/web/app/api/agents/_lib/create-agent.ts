import { agentModel } from "@/server/models";
import { generateApiKey } from "@/server/api-key";
import { getTemplate } from "@/server/agent-templates";
import {
  generateAgentConfig,
  generateBootstrapMessage,
  computeCronSchedule,
  getMcUrl,
} from "@/server/agent-config-generator";
import { workspacePathUnix } from "@/server/workspace-paths";
import { invalidateAgentListCache } from "@/server/cache";
import { pubsub, PubSubEvent } from "@/server/pubsub";
import { ensureAgentProfile } from "@/server/agent-profile";
import type { z } from "zod/v4";
import type { createAgentSchema } from "../../_lib/validation";
import { getAgentSlug, type AgentConfigFile, type AgentSetupResult } from "@agentcenter/utils";
import { AgentStatus, SetupStatus, AgentLevel } from "@/server/constants";

type CreateAgentInput = z.infer<typeof createAgentSchema>;

export type CreateAgentResult = Omit<AgentSetupResult, "agent"> & {
  agent: Record<string, unknown>;
};
export type { AgentConfigFile };

/**
 * Shared logic to create a single agent.
 * Used by both POST /api/agents/create and POST /api/agents/batch-create.
 *
 * @param input  Validated agent fields
 * @param agentOrdinal  The ordinal index for cron staggering (typically current agent count)
 */
export async function createSingleAgent(
  input: CreateAgentInput,
  agentOrdinal: number,
): Promise<CreateAgentResult> {
  const { name, role, username, identityEmoji, personality, level, templateId, workspacePath } =
    input;

  const { plainKey, hash, prefix } = generateApiKey();
  const template = templateId ? getTemplate(templateId) : undefined;

  const agent = await agentModel.create({
    data: {
      name,
      role,
      username: username || undefined,
      identityEmoji: identityEmoji || template?.emoji || "🤖",
      personality: personality || template?.personality || undefined,
      level: (level || template?.level || AgentLevel.SPECIALIST) as any,
      workspacePath: workspacePath || undefined,
      status: AgentStatus.IDLE,
      setupStatus: SetupStatus.PENDING_SETUP,
      apiKeyHash: hash,
      apiKeyPrefix: prefix,
      apiKeyCreatedAt: new Date(),
      templateId: templateId || undefined,
      createdBy: "dashboard",
    },
  });

  invalidateAgentListCache();
  pubsub.publish(PubSubEvent.AGENT.STATUS_CHANGED, { agentId: agent.id });

  const agentSlug = getAgentSlug({ username: agent.username, name });
  const resolvedWorkspacePath = workspacePath || workspacePathUnix(agentSlug);

  if (!workspacePath) {
    await agentModel.update(agent.id, {
      data: { workspacePath: resolvedWorkspacePath },
    });
  }

  await ensureAgentProfile(agent.id);

  const mcUrl = getMcUrl();
  const cronSchedule = computeCronSchedule(agentOrdinal);
  const agentInfo = {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    username: agentSlug,
    identityEmoji: agent.identityEmoji || "🤖",
    personality: agent.personality || "",
    level: agent.level || AgentLevel.SPECIALIST,
    capabilities: template?.capabilities,
    templateId: templateId || undefined,
  };

  const configFiles = generateAgentConfig(agentInfo, mcUrl, cronSchedule, plainKey);

  const openclawAgentConfig = {
    id: agentSlug,
    name: agent.name,
    workspace: resolvedWorkspacePath,
  };

  const cronMessage = "Read HEARTBEAT.md and follow the instructions.";
  const cronCommand = `openclaw cron add --name "${agentSlug}-heartbeat" --agent "${agentSlug}" --cron "${cronSchedule}" --session isolated --message "${cronMessage}" --timeout-seconds 300`;

  const bootstrapMessage = generateBootstrapMessage(agentInfo, mcUrl, plainKey, {
    workspacePath: resolvedWorkspacePath,
    cronCommand,
    configFiles,
    openclawAgentConfig,
  });

  return {
    agent: { ...agent, workspacePath: resolvedWorkspacePath },
    apiKey: plainKey,
    configFiles,
    bootstrapMessage,
    cronSchedule,
    cronMessage,
    cronCommand,
    workspacePath: resolvedWorkspacePath,
    openclawAgentConfig,
    requiredClis: ["openclaw"],
    mcUrl,
  };
}
