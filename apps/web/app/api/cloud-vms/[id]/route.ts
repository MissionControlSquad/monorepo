import { findCloudVMById, findCloudVMRaw, updateCloudVM } from "@agentcenter/database";
import { destroyCloudVM } from "@/server/services/cloud-vm";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { resolveSession } from "../../_lib/resolve-session";

/**
 * GET /api/cloud-vms/[id]
 * Get VM details with assigned agents.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await resolveSession(request);
    const { id } = await params;

    const vm = await findCloudVMById(id);

    if (!vm) {
      return errorResponse("VM not found", 404);
    }

    return successResponse(vm);
  } catch (err) {
    return handleError(err);
  }
}

/**
 * PATCH /api/cloud-vms/[id]
 * Update VM metadata (e.g. name).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { name } = body as { name?: string };

    const vm = await findCloudVMRaw(id);
    if (!vm) return errorResponse("VM not found", 404);

    const updated = await updateCloudVM(id, {
      ...(name !== undefined ? { name: name.trim() || null } : {}),
    });

    return successResponse(updated);
  } catch (err) {
    return handleError(err);
  }
}

/**
 * DELETE /api/cloud-vms/[id]
 * Destroy a VM (unassigns all agents first).
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const vm = await findCloudVMRaw(id);
    if (!vm) {
      return errorResponse("VM not found", 404);
    }

    await destroyCloudVM(id);

    return successResponse({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
