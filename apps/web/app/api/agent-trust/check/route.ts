import { withAgent } from "../../_lib/with-agent";
import { successResponse, errorResponse } from "../../_lib/json-response";
import { FLAG_KEYS } from "@agentcenter/utils";
import { isActionAllowed, type TrustCheckKind } from "@/server/services/trust";

const KINDS: TrustCheckKind[] = ["host_write", "pr_merge", "command"];

// Epic #3: an agent checks whether it may perform a gated action, before running it.
export const POST = withAgent(
  async (request, agent) => {
    const body = (await request.json()) as { action?: string; kind?: string };
    if (!body.action) return errorResponse("action is required", 400);
    if (!body.kind || !KINDS.includes(body.kind as TrustCheckKind))
      return errorResponse("kind must be one of host_write|pr_merge|command", 400);

    const decision = await isActionAllowed(agent.id, body.action, body.kind as TrustCheckKind);
    return successResponse(decision);
  },
  { feature: { flag: FLAG_KEYS.GOVERNANCE, error: "Governance is not enabled" } },
);
