import { prisma } from "@/server/prisma";
import { provisionVM } from "@/server/services/cloud-vm";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";

/**
 * POST /api/cloud-vms/[id]/retry
 * Retry provisioning for a VM in error state.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const vm = await prisma.cloudVM.findUnique({ where: { id } });
    if (!vm) {
      return errorResponse("VM not found", 404);
    }

    if (vm.status !== "error") {
      return errorResponse("Can only retry VMs in error state", 400);
    }

    if (!vm.externalServerId || !vm.ipv4) {
      return errorResponse("VM has no server — create a new VM instead", 400);
    }

    // Reset status and fire-and-forget provisioning
    await prisma.cloudVM.update({
      where: { id },
      data: {
        status: "provisioning",
        errorMessage: null,
        errorAt: null,
        setupStep: "retrying",
        setupProgress: 5,
      },
    });

    await prisma.cloudVMLog.create({
      data: {
        vmId: id,
        message: "Retrying provisioning...",
        level: "info",
      },
    });

    provisionVM(id).catch((err) => {
      console.error(`[cloud-vm] retry provisionVM(${id}) error:`, err);
    });

    return successResponse({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
