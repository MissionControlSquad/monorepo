import { setVMDefaultModel } from "@/server/services/cloud-vm";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";

/**
 * POST /api/cloud-vms/[id]/llm-model
 * Switch the VM-level default model (no API key needed — just changes the model).
 * Body: { model: string }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { model } = body as { model?: string };

    if (!model || typeof model !== "string") {
      return errorResponse("model is required", 400);
    }

    await setVMDefaultModel(id, model);

    return successResponse({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
