import { env } from "@/server/env";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { drainSandboxRunQueue } from "@/server/services/sandbox-run";

/**
 * Cron: drain queued sandbox runs (background execution). Serverless-compatible worker — each tick
 * claims + executes a bounded batch of queued AgentRuns. A persistent-server deployment can also run
 * an in-process loop; both share drainSandboxRunQueue. CRON_SECRET-authed.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return errorResponse("Unauthorized", 401);
  }
  try {
    const started = await drainSandboxRunQueue(5);
    return successResponse({ started });
  } catch (err) {
    return handleError(err);
  }
}
