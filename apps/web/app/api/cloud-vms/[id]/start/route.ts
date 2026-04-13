import { startCloudVM } from "@/server/services/cloud-vm";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { findCloudVMRaw } from "@agentcenter/database";

/**
 * POST /api/cloud-vms/[id]/start
 * Power on a stopped VM.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const vm = await findCloudVMRaw(id);
    if (!vm) {
      return errorResponse(ERR.VM_NOT_FOUND, 404);
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
