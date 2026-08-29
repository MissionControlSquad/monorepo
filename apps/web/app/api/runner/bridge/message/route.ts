import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { withFeature } from "../../../_lib/with-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { verifyRunBridgeToken, bridgePostMessage } from "@/server/services/run-bridge";

/**
 * POST /api/runner/bridge/message
 *
 * The in-sandbox API bridge (Plan 6). An agent running INSIDE a sandbox posts progress back to its
 * task using the run-scoped token injected into its env (AGENTCENTER_RUN_TOKEN). Least-privilege: the
 * token authorizes ONE action (post a message to the run's task) for the run's lifetime only. No
 * workspace credentials are involved; a leaked token can do nothing else.
 *
 *   Authorization: Bearer rbt_<token>
 *   { "content": "..." }
 */
export const POST = withFeature(
  { flag: FLAG_KEYS.RUNNERS, error: "Runners are not enabled" },
  postHandler,
);

async function postHandler(request: Request) {
  try {
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const run = await verifyRunBridgeToken(token);
    if (!run) return errorResponse("Invalid or expired run token", 401, "UNAUTHORIZED");

    const body = (await request.json().catch(() => ({}))) as { content?: unknown };
    const content = typeof body.content === "string" ? body.content : "";
    const posted = await bridgePostMessage(run, content);
    if (!posted) return errorResponse("Nothing to post (empty content or run has no task)", 400);

    return successResponse({ ok: true, runId: run.runId });
  } catch (err) {
    return handleError(err);
  }
}
