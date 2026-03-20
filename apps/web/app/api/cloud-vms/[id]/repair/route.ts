import { repairOpenClawService } from "@/server/services/cloud-vm";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { findCloudVMRaw } from "@agentcenter/database";

/**
 * POST /api/cloud-vms/[id]/repair
 * Patch the systemd service file and restart OpenClaw on a running VM.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const vm = await findCloudVMRaw(id);
    if (!vm) return errorResponse("VM not found", 404);
    if (vm.status !== "running") return errorResponse("VM must be running", 400);

    await repairOpenClawService(id);

    return successResponse({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
