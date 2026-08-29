import { agentModel } from "@/server/models";
import { checkLicenseLimit } from "@/server/license";
import { Prisma } from "@agentcenter/database";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { validateBody, batchCreateAgentSchema } from "../../_lib/validation";
import { createSingleAgent, type CreateAgentResult } from "../_lib/create-agent";
import { withTenancy } from "../../_lib/rest-tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { recordPlanUsageFromRequest } from "@/server/tenancy";
import { USAGE_QUOTA_SLUGS } from "@/lib/quota-slugs";

/**
 * POST /api/agents/batch-create
 * Creates multiple agents in one request (onboarding wizard) — human ADMIN only (previously
 * unauthenticated). Body: { agents: [{ name, role, ... }, ...] } → { results, totalCreated }.
 */
export const POST = withTenancy(
  async (request, _tenancy) => {
    try {
      const parsed = await validateBody(request, batchCreateAgentSchema);
      if (parsed.error) return parsed.error;

      const { agents } = parsed.data;

      // Check license limit
      const agentCount = await agentModel.count();
      const limitCheck = await checkLicenseLimit("agents", agentCount);
      if (!limitCheck.allowed) {
        return errorResponse(
          `Agent limit reached (${limitCheck.limit}). Upgrade your plan to add more agents.`,
          403,
        );
      }

      // -1 means unlimited
      if (limitCheck.limit !== -1 && agentCount + agents.length > limitCheck.limit) {
        return errorResponse(
          `Adding ${agents.length} agents would exceed your limit of ${limitCheck.limit}. You currently have ${agentCount} agent(s).`,
          403,
        );
      }

      // Verify all usernames are unique within the batch
      const usernames = agents.map((a) => a.username).filter((u): u is string => !!u);
      const uniqueUsernames = new Set(usernames);
      if (uniqueUsernames.size !== usernames.length) {
        return errorResponse("Duplicate usernames in batch", 400);
      }

      // Check against existing usernames in DB
      if (usernames.length > 0) {
        const existing = await agentModel.findMany({
          where: { username: { in: usernames } },
        });
        if (existing.length > 0) {
          const taken = existing.map((a: any) => a.username).join(", ");
          return errorResponse(`Username(s) already taken: ${taken}`, 409);
        }
      }

      // Create agents sequentially (Squad Lead first for cron staggering)
      const results: CreateAgentResult[] = [];
      for (let i = 0; i < agents.length; i++) {
        const result = await createSingleAgent(agents[i], agentCount + i);
        results.push(result);
      }

      // Best-effort: record consumption of the workspace's HUMAN plan `agents` quota in buildbase —
      // one unit per agent created in the batch (parity with the single-create path). Fail-safe +
      // dormant until buildbase is configured; never blocks or breaks the create.
      await recordPlanUsageFromRequest(request, {
        quotaSlug: USAGE_QUOTA_SLUGS.agents,
        quantity: results.length,
      });

      return successResponse({ results, totalCreated: results.length }, 201);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return errorResponse("A username in the batch is already taken", 409);
      }
      return handleError(err);
    }
  },
  { minRole: WORKSPACE_ROLES.ADMIN },
);
