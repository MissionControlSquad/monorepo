import { resolveAgent } from "../../_lib/resolve-agent";
import { requireAgentCapability } from "@/server/services/agent-authz";
import { AGENT_CAPABILITY } from "@agentcenter/utils";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { checkoutTask, renewCheckout, releaseCheckout } from "@/server/services/task-checkout";

// Epic #8: agents claim/renew/release a task lease (API-key auth, not a session). Atomic checkout
// hands back a fencing token that renew/release must present.
export async function POST(request: Request) {
  try {
    if (!(await isFeatureEnabled(FLAG_KEYS.TASK_AUTONOMY)))
      return errorResponse("Task autonomy is not enabled", 403, "FEATURE_DISABLED");
    const agent = await resolveAgent(request);
    await requireAgentCapability(agent, AGENT_CAPABILITY.TASKS_CHECKOUT);

    const body = (await request.json()) as {
      taskId?: string;
      action?: "checkout" | "renew" | "release";
      token?: string;
      leaseSeconds?: number;
    };
    if (!body.taskId) return errorResponse("taskId is required", 400);
    const action = body.action ?? "checkout";
    const leaseSeconds = body.leaseSeconds ?? 300;

    if (action === "checkout") {
      const profileId = await getOrCreateAgentProfileId(agent.id);
      const result = await checkoutTask(body.taskId, profileId, leaseSeconds);
      return successResponse({
        ok: true,
        token: result.token,
        leaseExpiresAt: result.leaseExpiresAt,
      });
    }
    if (!body.token) return errorResponse("token is required for renew/release", 400);
    if (action === "renew") {
      const expires = await renewCheckout(body.taskId, body.token, leaseSeconds);
      return successResponse({ ok: true, leaseExpiresAt: expires });
    }
    if (action === "release") {
      const released = await releaseCheckout(body.taskId, body.token);
      return successResponse({ ok: released });
    }
    return errorResponse("action must be checkout|renew|release", 400);
  } catch (err) {
    return handleError(err);
  }
}
