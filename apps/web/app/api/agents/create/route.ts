import { agentModel } from "@/server/models";
import { checkLicenseLimit } from "@/server/license";
import { Prisma } from "@agentcenter/database";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { validateBody, createAgentSchema } from "../../_lib/validation";
import { createSingleAgent } from "../_lib/create-agent";
import { withTenancy } from "../../_lib/rest-tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { recordPlanUsageFromRequest } from "@/server/tenancy";
import { USAGE_QUOTA_SLUGS } from "@/lib/quota-slugs";

/**
 * POST /api/agents/create
 * Dashboard-only endpoint to create a new agent — human ADMIN only (previously unauthenticated: anyone
 * could mint an agent + its API key and consume the workspace's license quota).
 *
 * Body: { name, role, username, identityEmoji, personality, level, templateId, workspacePath }
 * Returns: agent record + plain API key (shown once) + config files + cron command
 */
export const POST = withTenancy(
  async (request, _tenancy) => {
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

      // Best-effort: record consumption of the workspace's HUMAN plan `agents` quota in buildbase.
      // Fail-safe + dormant until buildbase is configured — never blocks or breaks the create.
      // (Separate from the AI-agent LLM/run budget in finance.prisma.)
      await recordPlanUsageFromRequest(request, { quotaSlug: USAGE_QUOTA_SLUGS.agents });

      return successResponse(result, 201);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return errorResponse("Username is already taken", 409);
      }
      return handleError(err);
    }
  },
  { minRole: WORKSPACE_ROLES.ADMIN },
);
