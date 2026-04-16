import {
  findCloudVMById,
  findCloudVMRaw,
  updateCloudVM,
  getPluginVersionByMachineName,
} from "@agentcenter/database";
import { destroyCloudVM } from "@/server/services/cloud-vm";
import { successResponse, handleError, assertFound } from "../../_lib/json-response";
import { ERR } from "../../_lib/error-messages";
import { resolveSession } from "../../_lib/resolve-session";
import { BRIDGE_PLUGIN_VERSION } from "@/server/bridge-plugin-version";

/**
 * GET /api/cloud-vms/[id]
 * Get VM details with assigned agents.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await resolveSession(request);
    const { id } = await params;

    const vm = await findCloudVMById(id);

    assertFound(vm, ERR.VM_NOT_FOUND);

    // Attach plugin version from the last connection record (if gateway is enabled)
    let pluginVersion: string | null = null;
    if ((vm as any).liveGatewayTokenId && (vm as any).serverName) {
      pluginVersion = await getPluginVersionByMachineName((vm as any).serverName);
    }

    const latestPluginVersion = BRIDGE_PLUGIN_VERSION;

    return successResponse({ ...vm, pluginVersion, latestPluginVersion });
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
    assertFound(vm, ERR.VM_NOT_FOUND);

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
    assertFound(vm, ERR.VM_NOT_FOUND);

    await destroyCloudVM(id);

    return successResponse({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
