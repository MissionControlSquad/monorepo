import { agentModel } from "@/server/models";
import { Prisma } from "@agentcenter/database";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { validateBody, batchCreateAgentSchema } from "../../_lib/validation";
import { createSingleAgent, type CreateAgentResult } from "../_lib/create-agent";

/**
 * POST /api/agents/batch-create
 * Creates multiple agents in one request (onboarding wizard).
 *
 * Body: { agents: [{ name, role, ... }, ...] }
 * Returns: { results: [...], totalCreated: number }
 */
export async function POST(request: Request) {
  try {
    const parsed = await validateBody(request, batchCreateAgentSchema);
    if (parsed.error) return parsed.error;

    const { agents } = parsed.data;

    // Existing agent count staggers the new agents' cron schedules
    const agentCount = await agentModel.count();

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

    return successResponse({ results, totalCreated: results.length }, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return errorResponse("A username in the batch is already taken", 409);
    }
    return handleError(err);
  }
}
