import { stopCloudVM, startCloudVM } from "@/server/services/cloud-vm";
import { findCloudVMRaw } from "@agentcenter/database";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { CloudVmStatus } from "@/server/constants";

/**
 * POST /api/cloud-vms/[id]/restart
 * Gracefully stop then start a VM. Allowed from "running" or "stopped" states.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const vm = await findCloudVMRaw(id);
    if (!vm) return errorResponse(ERR.VM_NOT_FOUND, 404);

    if (![CloudVmStatus.RUNNING, CloudVmStatus.STOPPED].includes(vm.status as any)) {
      return errorResponse(
        `Cannot restart a VM in "${vm.status}" state. VM must be running or stopped.`,
        400,
      );
    }

    if (vm.status === CloudVmStatus.RUNNING) {
      await stopCloudVM(id);
    }
    await startCloudVM(id);

    return successResponse({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Can only")) {
      return errorResponse(err.message, 400);
    }
    return handleError(err);
  }
}
