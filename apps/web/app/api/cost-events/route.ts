import { resolveAgent } from "../_lib/resolve-agent";
import { requireAgentCapability } from "@/server/services/agent-authz";
import { AGENT_CAPABILITY } from "@agentcenter/utils";
import { successResponse, errorResponse, handleError } from "../_lib/json-response";
import { checkRateLimit } from "../_lib/rate-limit-check";
import { createRateLimiter } from "@/server/rate-limit";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { DEFAULT_WORKSPACE_ID } from "@/server/tenancy";
import { recordCostEvent } from "@/server/services/cost";

// Agents/VMs report LLM/run cost here (they authenticate with an API key, not a session).
const costLimiter = createRateLimiter({ max: 240, windowSec: 60, prefix: "rl:cost" });

// Epic #4: cost ingestion. Scoped to the resolving agent's workspace; funnels recordCostEvent.
export async function POST(request: Request) {
  try {
    const limited = await checkRateLimit(costLimiter, request);
    if (limited) return limited;

    if (!(await isFeatureEnabled(FLAG_KEYS.BUDGETS)))
      return errorResponse("Budgets are not enabled", 403, "FEATURE_DISABLED");

    const agent = await resolveAgent(request);
    await requireAgentCapability(agent, AGENT_CAPABILITY.COST_REPORT);
    const workspaceId = agent.workspaceId ?? DEFAULT_WORKSPACE_ID;

    const body = (await request.json()) as {
      agentId?: string;
      model?: string;
      provider?: string;
      taskId?: string;
      projectId?: string;
      billerId?: string;
      issueId?: string;
      tokensIn?: number;
      tokensOut?: number;
      amountCents?: number;
      source?: string;
      idempotencyKey?: string;
    };

    if (typeof body.amountCents !== "number" || !Number.isFinite(body.amountCents))
      return errorResponse("amountCents (number) is required", 400);
    if (body.amountCents < 0) return errorResponse("amountCents must be >= 0", 400);

    // An agent may only ever attribute cost to itself — never spoof another agent's spend.
    const attributedAgentId = body.agentId && body.agentId !== agent.id ? undefined : agent.id;
    if (body.agentId && body.agentId !== agent.id)
      return errorResponse("agentId must match the authenticated agent", 403);

    const event = await recordCostEvent({
      workspaceId,
      agentId: attributedAgentId,
      model: body.model,
      provider: body.provider,
      taskId: body.taskId,
      projectId: body.projectId,
      billerId: body.billerId,
      issueId: body.issueId,
      tokensIn: body.tokensIn,
      tokensOut: body.tokensOut,
      amountCents: Math.trunc(body.amountCents),
      source: body.source ?? "agent",
      idempotencyKey: body.idempotencyKey ?? null,
    });

    return successResponse({ ok: true, id: event.id });
  } catch (err) {
    return handleError(err);
  }
}
