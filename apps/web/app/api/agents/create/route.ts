import { agentModel } from "@/server/models";
import { checkLicenseLimit } from "@/server/license";
import { Prisma } from "@agentcenter/database";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { validateBody, createAgentSchema } from "../../_lib/validation";
import { createSingleAgent } from "../_lib/create-agent";

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

    const { username } = parsed.data;

    // Check username uniqueness + count agents in parallel
    const [existing, agentCount] = await Promise.all([
      username ? agentModel.findOne({ where: { username } }) : Promise.resolve(null),
      agentModel.count(),
    ]);

    if (existing) {
      return errorResponse(`Username "${username}" is already taken`, 409);
    }

    // Enforce license limit on agent count
    const limitCheck = await checkLicenseLimit("agents", agentCount);
    if (!limitCheck.allowed) {
      return errorResponse(
        `Agent limit reached (${limitCheck.limit}). Upgrade your plan to add more agents.`,
        403,
      );
    }

    const result = await createSingleAgent(parsed.data, agentCount);

    return successResponse(result, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return errorResponse("Username is already taken", 409);
    }
    return handleError(err);
  }
}
