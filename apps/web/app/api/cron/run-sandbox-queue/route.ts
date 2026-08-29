import { successResponse, handleError } from "../../_lib/json-response";
import { withCronAuth } from "../../_lib/with-cron-auth";
import { drainSandboxRunQueue } from "@/server/services/sandbox-run";

/**
 * Cron: drain queued sandbox runs (background execution). Serverless-compatible worker — each tick
 * claims + executes a bounded batch of queued AgentRuns. A persistent-server deployment can also run
 * an in-process loop; both share drainSandboxRunQueue. CRON_SECRET-authed.
 */
export const GET = withCronAuth(async () => {
  try {
    const started = await drainSandboxRunQueue(5);
    return successResponse({ started });
  } catch (err) {
    return handleError(err);
  }
});
