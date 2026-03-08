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
import { Prisma } from "@prisma/client";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { validateBody, createAgentSchema } from "../../_lib/validation";

/**
 * POST /api/agents/create
 * Dashboard-only endpoint to create a new agent.
 *
 * Body: { name, role, username, identityEmoji, personality, level, templateId, workspacePath }
 * Returns: agent record + plain API key (shown once) + config files + cron command
 */
export async function POST(request: Request) {
  try {
    const parsed = await validateBody(request, createAgentSchema);
    if (parsed.error) return parsed.error;

    const { name, role, username, identityEmoji, personality, level, templateId, workspacePath } =
      parsed.data;

    // Generate API key + get template (synchronous)
    const { plainKey, hash, prefix } = generateApiKey();
    const template = templateId ? getTemplate(templateId) : undefined;

    // Check username uniqueness + count agents in parallel
    const [existing, agentCount] = await Promise.all([
      username ? agentModel.findOne({ where: { username } }) : Promise.resolve(null),
      agentModel.count(),
    ]);

    if (existing) {
      return errorResponse(`Username "${username}" is already taken`, 409);
    }

    // Create agent — invalidate the cached agent list used for @mention resolution
    const agent = await agentModel.create({
      data: {
        name,
        role,
        username: username || undefined,
        identityEmoji: identityEmoji || template?.emoji || "🤖",
        personality: personality || template?.personality || undefined,
        level: (level || template?.level || "specialist") as any,
        workspacePath: workspacePath || undefined,
        status: "idle",
        setupStatus: "pending_setup",
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
        apiKeyCreatedAt: new Date(),
        templateId: templateId || undefined,
        createdBy: "dashboard",
      },
    });

    invalidateAgentListCache();

    // Notify subscribers immediately so the dashboard updates
    pubsub.publish(PubSubEvent.AGENT.STATUS_CHANGED, { agentId: agent.id });

    // macOS/Linux workspace path (~/.openclaw/agents/<slug>/workspace)
    const agentSlug = agent.username || name.toLowerCase().replace(/\s+/g, "-");
    const resolvedWorkspacePath = workspacePath || workspacePathUnix(agentSlug);

    // Update agent with default path if none provided
    if (!workspacePath) {
      await agentModel.update(agent.id, {
        data: { workspacePath: resolvedWorkspacePath },
      });
    }

    await ensureAgentProfile(agent.id);

    // Generate config files
    const mcUrl = getMcUrl();
    const cronSchedule = computeCronSchedule(agentCount);
    const configFiles = generateAgentConfig(
      {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        username: agentSlug,
        identityEmoji: agent.identityEmoji || "🤖",
        personality: agent.personality || "",
        level: agent.level || "specialist",
        capabilities: template?.capabilities,
        templateId: templateId || undefined,
      },
      mcUrl,
      cronSchedule,
      plainKey,
    );

    // OpenClaw agent config snippet (user adds this to ~/.openclaw/openclaw.json)
    const openclawAgentConfig = {
      id: agentSlug,
      name: agent.name,
      workspace: resolvedWorkspacePath,
    };

    // Build cron command (isolated session = independent agent turn per run)
    const cronCommand = `openclaw cron add --name "${agentSlug}-heartbeat" --agent "${agentSlug}" --cron "${cronSchedule}" --session isolated --message "Read HEARTBEAT.md and follow the instructions." --timeout-seconds 300`;

    // Auto-mode: single bootstrap message for pasting into a channel
    const agentInfo = {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      username: agentSlug,
      identityEmoji: agent.identityEmoji || "🤖",
      personality: agent.personality || "",
      level: agent.level || "specialist",
      capabilities: template?.capabilities,
      templateId: templateId || undefined,
    };
    const bootstrapMessage = generateBootstrapMessage(agentInfo, mcUrl, plainKey, {
      workspacePath: resolvedWorkspacePath,
      cronCommand,
      configFiles,
      openclawAgentConfig,
    });

    return successResponse(
      {
        agent: { ...agent, workspacePath: resolvedWorkspacePath },
        apiKey: plainKey,
        configFiles,
        bootstrapMessage,
        cronSchedule,
        cronCommand,
        workspacePath: resolvedWorkspacePath,
        openclawAgentConfig,
        mcUrl,
      },
      201,
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return errorResponse("Username is already taken", 409);
    }
    return handleError(err);
  }
}
