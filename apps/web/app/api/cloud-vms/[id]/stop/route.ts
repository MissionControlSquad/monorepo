import { stopCloudVM } from "@/server/services/cloud-vm";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { prisma } from "@/server/prisma";

/**
 * POST /api/cloud-vms/[id]/stop
 * Power off a running VM.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const vm = await prisma.cloudVM.findUnique({ where: { id } });
    if (!vm) {
      return errorResponse("VM not found", 404);
    }

    await stopCloudVM(id);

    return successResponse({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Can only")) {
      return errorResponse(err.message, 400);
    }
    return handleError(err);
  }
}
