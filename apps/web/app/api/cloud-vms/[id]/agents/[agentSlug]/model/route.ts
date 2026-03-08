import { setAgentModelOnVM } from "@/server/services/cloud-vm";
import { successResponse, errorResponse, handleError } from "../../../../../_lib/json-response";

/**
 * POST /api/cloud-vms/[id]/agents/[agentSlug]/model
 * Set or clear a per-agent model override.
 * Body: { model: string | null }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; agentSlug: string }> },
) {
  try {
    const { id, agentSlug } = await params;
    const body = await request.json().catch(() => ({}));
    const { model } = body as { model?: string | null };

    if (model !== null && model !== undefined && typeof model !== "string") {
      return errorResponse("model must be a string or null", 400);
    }

    await setAgentModelOnVM(id, agentSlug, model ?? null);

    return successResponse({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
