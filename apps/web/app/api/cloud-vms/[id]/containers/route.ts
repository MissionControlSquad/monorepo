import { findCloudVMConnection } from "@agentcenter/database";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { getVMSSHConfig } from "@/server/services/cloud-vm-utils";
import { sshExec } from "@/server/services/ssh";
import { CloudVmStatus } from "@/server/constants";

/**
 * GET /api/cloud-vms/[id]/containers
 * List Docker containers on the VM via SSH.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const vm = await findCloudVMConnection(id);

    if (!vm) return errorResponse(ERR.VM_NOT_FOUND, 404);
    if (vm.status !== CloudVmStatus.RUNNING || !vm.ipv4 || !vm.sshPrivateKey) {
      return errorResponse(ERR.VM_NOT_RUNNING, 400);
    }

    const sshConfig = getVMSSHConfig(vm);

    const result = await sshExec(
      sshConfig,
      `docker ps -a --format '{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","status":"{{.Status}}","state":"{{.State}}"}'`,
      { timeoutMs: 15_000 },
    );

    if (result.code !== 0) {
      return errorResponse(`Failed to list containers: ${result.stderr.slice(0, 300)}`, 500);
    }

    const containers = result.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return successResponse({ containers });
  } catch (err) {
    return handleError(err);
  }
}
