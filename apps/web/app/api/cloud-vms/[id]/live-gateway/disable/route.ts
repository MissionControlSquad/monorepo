import { disableVMLiveGateway } from "@/server/services/cloud-vm";
import {
  successResponse,
  errorResponse,
  handleError,
  assertFound,
} from "../../../../_lib/json-response";
import { ERR } from "../../../../_lib/error-messages";
import { findCloudVMRaw } from "@agentcenter/database";

/**
 * POST /api/cloud-vms/[id]/live-gateway/disable
 * Revoke install token, disable plugin config, and clean up gateway connections.
 * VM must be in RUNNING state.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
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
