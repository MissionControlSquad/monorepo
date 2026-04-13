import { agentModel } from "@/server/models";
import { listRunningCloudVMsWithAgents } from "@agentcenter/database";
import { getTemplate } from "@/server/agent-templates";
import {
  generateAgentConfig,
  generateBootstrapMessage,
  computeCronSchedule,
  getMcUrl,
} from "@/server/agent-config-generator";
import { workspacePathUnix } from "@/server/workspace-paths";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { AgentLevel } from "@/server/constants";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/agents/:id/setup
 * Returns generated config files and cron command (without API key).
 * Workspace path is always Unix-style (~/.openclaw/agents/<slug>/workspace) for macOS/Linux.
 */
export async function GET(_request: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;

    const agent = await agentModel.findById(id);
    if (!agent) return errorResponse("Agent not found", 404);

    const template = agent.templateId ? getTemplate(agent.templateId) : undefined;
    const mcUrl = getMcUrl();

    // Compute slug once and reuse everywhere
    const agentSlug = agent.username || agent.name.toLowerCase().replace(/\s+/g, "-");
    const resolvedWorkspacePath = agent.workspacePath ?? workspacePathUnix(agentSlug);

    // Count agents created before this one for cron scheduling
    const agentsBefore = await agentModel.count({
      where: { createdAt: { lt: agent.createdAt } },
    });
    const cronSchedule = computeCronSchedule(agentsBefore);

    const agentInfo = {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      username: agentSlug,
      identityEmoji: agent.identityEmoji || "🤖",
      personality: agent.personality || "",
      level: agent.level || AgentLevel.SPECIALIST,
      capabilities: template?.capabilities,
      templateId: agent.templateId || undefined,
    };

    const configFiles = generateAgentConfig(agentInfo, mcUrl, cronSchedule);

    // OpenClaw agent config snippet
    const openclawAgentConfig = {
      id: agentSlug,
      name: agent.name,
      workspace: resolvedWorkspacePath,
    };

    const cronMessage = "Read HEARTBEAT.md and follow the instructions.";
    const cronCommand = `openclaw cron add --name "${agentSlug}-heartbeat" --agent "${agentSlug}" --cron "${cronSchedule}" --session isolated --message "${cronMessage}" --timeout-seconds 300`;

    // Auto-mode bootstrap (uses $API_KEY placeholder since plain key not available)
    const bootstrapMessage = generateBootstrapMessage(agentInfo, mcUrl, "$API_KEY", {
      workspacePath: resolvedWorkspacePath,
      cronCommand,
      configFiles,
      openclawAgentConfig,
    });

    // Fetch available cloud VMs for the "Deploy to VM" option
    const cloudVms = await listRunningCloudVMsWithAgents();

    return successResponse({
      agent: {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        setupStatus: agent.setupStatus,
        apiKeyPrefix: agent.apiKeyPrefix,
        hostingType: agent.hostingType,
        cloudVmId: agent.cloudVmId,
      },
      configFiles,
      bootstrapMessage,
      cronSchedule,
      cronMessage,
      cronCommand,
      workspacePath: resolvedWorkspacePath,
      openclawAgentConfig,
      // CLIs the desktop bootstrap handler must verify before setup starts.
      // Add "claude", "codex", etc. here when they become required.
      requiredClis: ["openclaw"],
      mcUrl,
      cloudVms,
    });
  } catch (err) {
    return handleError(err);
  }
}
