import { disableVMLiveGateway } from "@/server/services/cloud-vm";
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
 * POST /api/cloud-vms/[id]/live-gateway/disable
 * Revoke install token, disable plugin config, and clean up gateway connections.
 * VM must be in RUNNING state.
 */
async function postHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await resolveSession(request);

    const limited = await checkRateLimit(apiLimiters.cloudVms, request);
    if (limited) return limited;

    const { id } = await params;

    const vm = await findCloudVMRaw(id);
    assertFound(vm, ERR.VM_NOT_FOUND);

    await disableVMLiveGateway(id);

    return successResponse({ ok: true });
  } catch (err) {
    if (err instanceof Error) {
      return errorResponse(err.message, 400);
    }
    return handleError(err);
  }
}

export const POST = withFeature(FLAG_KEYS.LIVE_GATEWAY, postHandler);
