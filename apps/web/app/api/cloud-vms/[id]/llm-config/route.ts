import { findCloudVMRaw } from "@agentcenter/database";
import { configureLLMOnVM } from "@/server/services/cloud-vm";
import {
  successResponse,
  errorResponse,
  handleError,
  assertFound,
} from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";

/**
 * POST /api/cloud-vms/[id]/llm-config
 * Configure LLM provider on a VM.
 *
 * Body: { providerId, apiKey, model }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { providerId, apiKey, model } = body;

    if (!providerId || !apiKey || !model) {
      return errorResponse("providerId, apiKey, and model are required", 400);
    }

    const vm = await findCloudVMRaw(id);
    assertFound(vm, ERR.VM_NOT_FOUND);

    await configureLLMOnVM({ vmId: id, providerId, apiKey, model });

    return successResponse({ ok: true });
  } catch (err) {
    console.error("[llm-config] Error:", err instanceof Error ? err.message : "Unknown error");
    if (err instanceof Error && err.message.includes("Invalid API key")) {
      return errorResponse("Invalid API key", 400);
    }
    return handleError(err);
  }
}
