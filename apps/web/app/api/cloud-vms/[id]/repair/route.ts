import { repairOpenClawService } from "@/server/services/cloud-vm";
import {
  successResponse,
  errorResponse,
  handleError,
  assertFound,
} from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { findCloudVMRaw } from "@agentcenter/database";
import { CloudVmStatus } from "@/server/constants";

/**
 * POST /api/cloud-vms/[id]/repair
 * Patch the systemd service file and restart OpenClaw on a running VM.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const vm = await findCloudVMRaw(id);
    assertFound(vm, ERR.VM_NOT_FOUND);
    if (vm.status !== CloudVmStatus.RUNNING) return errorResponse("VM must be running", 400);

    await repairOpenClawService(id);

    return successResponse({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
