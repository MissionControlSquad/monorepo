import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { withFeature } from "../../../_lib/with-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import {
  verifyRunBridgeToken,
  bridgePresignAttachment,
  bridgeConfirmAttachment,
} from "@/server/services/run-bridge";

/**
 * POST /api/runner/bridge/attachment
 *
 * The in-sandbox API bridge attachment action (least-privilege, run-scoped). An agent running INSIDE
 * a sandbox attaches a produced artifact to ITS task using the run-scoped token in its env
 * (AGENTCENTER_RUN_TOKEN). The token authorizes ONLY the run's task + workspace for the run's
 * lifetime; no workspace credentials are involved.
 *
 * Two-phase, matching the presigned R2 upload:
 *   1) { "fileName": "report.pdf", "contentType": "application/pdf" }
 *        -> { attachmentId, uploadUrl }   (agent then PUTs the bytes to uploadUrl)
 *   2) { "confirm": true, "attachmentId": "...", "byteSize": 1234 }
 *        -> { ok: true }
 *
 *   Authorization: Bearer rbt_<token>
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
    if (!run.taskId) return errorResponse("Run has no task to attach to", 400);

    const body = (await request.json().catch(() => ({}))) as {
      fileName?: unknown;
      contentType?: unknown;
      confirm?: unknown;
      attachmentId?: unknown;
      byteSize?: unknown;
    };

    if (body.confirm === true) {
      const attachmentId = typeof body.attachmentId === "string" ? body.attachmentId : "";
      const byteSize = typeof body.byteSize === "number" ? body.byteSize : undefined;
      const ok = await bridgeConfirmAttachment(run, attachmentId, byteSize);
      if (!ok) return errorResponse("attachmentId is required", 400);
      return successResponse({ ok: true, attachmentId });
    }

    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    const contentType = typeof body.contentType === "string" ? body.contentType.trim() : "";
    if (!fileName || !contentType) {
      return errorResponse("fileName and contentType are required", 400);
    }
    const presigned = await bridgePresignAttachment(run, fileName, contentType);
    if (!presigned) return errorResponse("Run has no task to attach to", 400);
    return successResponse({ ...presigned, runId: run.runId }, 201);
  } catch (err) {
    return handleError(err);
  }
}
