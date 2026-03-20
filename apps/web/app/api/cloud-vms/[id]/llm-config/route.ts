import { findCloudVMRaw } from "@agentcenter/database";
import { configureLLMOnVM } from "@/server/services/cloud-vm";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";

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
    if (!vm) {
      return errorResponse("VM not found", 404);
    }

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
