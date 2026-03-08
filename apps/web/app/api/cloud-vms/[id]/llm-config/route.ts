import { prisma } from "@/server/prisma";
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

    const vm = await prisma.cloudVM.findUnique({ where: { id } });
    if (!vm) {
      return errorResponse("VM not found", 404);
    }

    await configureLLMOnVM({ vmId: id, providerId, apiKey, model });

    return successResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[llm-config] Error:", message);
    if (message.includes("Invalid API key")) {
      return errorResponse(message, 400);
    }
    return handleError(err);
  }
}
