import { findCloudVMConnection } from "@agentcenter/database";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { CloudVmStatus } from "@/server/constants";
import {
  getVMSSHConfig,
  ocExec,
  listAgentsOnVM,
  readVMConfig,
} from "@/server/services/cloud-vm-utils";

/**
 * GET /api/cloud-vms/[id]/agents-live
 * Get the actual agent list from OpenClaw on the VM via CLI.
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

    // Try `openclaw agents list --json` first (uses shared parser)
    const agents = await listAgentsOnVM(sshConfig);
    if (agents.length > 0) {
      return successResponse({ agents });
    }

    // Fallback: plain `openclaw agents list` and parse text output
    const textResult = await ocExec(sshConfig, "openclaw agents list 2>/dev/null", {
      timeoutMs: 15_000,
    });
    if (textResult.code === 0 && textResult.stdout.trim()) {
      const lines = textResult.stdout.trim().split("\n");
      const textAgents: { id: string; name: string }[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (
          !trimmed ||
          trimmed.startsWith("─") ||
          trimmed.startsWith("=") ||
          trimmed.toLowerCase().includes("no agents")
        )
          continue;
        const match = trimmed.match(/^(?:\d+\.\s+)?(\S+)/);
        if (match) {
          textAgents.push({ id: match[1], name: match[1] });
        }
      }

      if (textAgents.length > 0) {
        return successResponse({ agents: textAgents });
      }
    }

    // Last fallback: read config file
    const config = await readVMConfig(sshConfig);
    const agentsList = (config?.agents as Record<string, unknown>)?.list as
      | { id?: string; name?: string }[]
      | undefined;
    if (agentsList && agentsList.length > 0) {
      return successResponse({
        agents: agentsList.map((a) => ({
          id: a.id || a.name,
          name: a.name || a.id,
        })),
      });
    }

    // No agents found
    return successResponse({ agents: [] });
  } catch (err) {
    return handleError(err);
  }
}
