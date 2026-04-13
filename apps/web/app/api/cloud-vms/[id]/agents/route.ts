import { findCloudVMRaw, listAgentsByVM, findAgentById } from "@agentcenter/database";
import { assignAgentToVM } from "@/server/services/cloud-vm";
import { ensureAgentOnVM } from "@/server/services/cloud-vm-ensure";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";

/**
 * GET /api/cloud-vms/[id]/agents
 * List agents assigned to this VM.
 * Returns the agents currently assigned to this VM.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const vm = await findCloudVMRaw(id);
    if (!vm) {
      return errorResponse(ERR.VM_NOT_FOUND, 404);
    }

    const agents = await listAgentsByVM(id);

    return successResponse({ agents });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/cloud-vms/[id]/agents
 * Assign an agent to this VM.
 *
 * If the agent is already on THIS VM, runs self-healing validation
 * (ensures agent is in agents list, workspace exists, config files present, cron active).
 *
 * Body: { agentId }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { agentId } = body;

    if (!agentId) {
      return errorResponse("agentId is required", 400);
    }

    const agent = await findAgentById(agentId);
    if (!agent) {
      return errorResponse(ERR.AGENT_NOT_FOUND, 404);
    }

    // Agent already on THIS VM — run self-healing instead of erroring
    if (agent.cloudVmId === id) {
      const result = await ensureAgentOnVM(id, agentId);
      return successResponse(result, 200);
    }

    // Agent on a DIFFERENT VM — clean up old VM and reassign (handled inside assignAgentToVM)
    // Fresh assignment
    await assignAgentToVM({ agentId, cloudVmId: id });

    return successResponse({ ok: true }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Can only assign")) {
      return errorResponse(err.message, 400);
    }
    return handleError(err);
  }
}
