import { resolveAgent } from "../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { isActionAllowed, type TrustCheckKind } from "@/server/services/trust";

const KINDS: TrustCheckKind[] = ["host_write", "pr_merge", "command"];

// Epic #3: an agent checks whether it may perform a gated action, before running it.
export async function POST(request: Request) {
  try {
    if (!(await isFeatureEnabled(FLAG_KEYS.GOVERNANCE)))
      return errorResponse("Governance is not enabled", 403, "FEATURE_DISABLED");
    const agent = await resolveAgent(request);

    const body = (await request.json()) as { action?: string; kind?: string };
    if (!body.action) return errorResponse("action is required", 400);
    if (!body.kind || !KINDS.includes(body.kind as TrustCheckKind))
      return errorResponse("kind must be one of host_write|pr_merge|command", 400);

    const decision = await isActionAllowed(agent.id, body.action, body.kind as TrustCheckKind);
    return successResponse(decision);
  } catch (err) {
    return handleError(err);
  }
}
