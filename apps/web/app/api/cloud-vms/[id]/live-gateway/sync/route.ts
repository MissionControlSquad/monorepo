import { syncVMLiveGatewayPlugin } from "@/server/services/cloud-vm";
import {
  successResponse,
  errorResponse,
  handleError,
  assertFound,
} from "../../../../_lib/json-response";
import { ERR } from "../../../../_lib/error-messages";
import { findCloudVMRaw } from "@agentcenter/database";
import { resolveSession } from "../../../../_lib/resolve-session";
import { apiLimiters, checkRateLimit } from "../../../../_lib/rate-limit-check";
import { withFeature } from "../../../../_lib/with-feature";
import { FLAG_KEYS } from "@agentcenter/utils";

/**
 * POST /api/cloud-vms/[id]/live-gateway/sync
 * Re-installs the agentcenter-bridge plugin binary from ClawHub (latest version)
 * and restarts the daemon. Existing token and config are preserved — no connection teardown.
 * VM must be in RUNNING state with live gateway already enabled.
 */
async function postHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await resolveSession(request);

    const limited = await checkRateLimit(apiLimiters.cloudVms, request);
    if (limited) return limited;

    const { id } = await params;

    const vm = await findCloudVMRaw(id);
    assertFound(vm, ERR.VM_NOT_FOUND);

    await syncVMLiveGatewayPlugin(id);

    return successResponse({ ok: true });
  } catch (err) {
    if (err instanceof Error) {
      return errorResponse(err.message, 400);
    }
    return handleError(err);
  }
}

export const POST = withFeature(FLAG_KEYS.LIVE_GATEWAY, postHandler);
