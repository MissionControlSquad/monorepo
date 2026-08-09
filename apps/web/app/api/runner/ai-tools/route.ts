import { resolveAgent } from "../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { saveReportedInventory } from "@/server/services/ai-runtime-inventory";
import type { RuntimeInventory } from "@/server/services/ai-runtime-detect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/runner/ai-tools
 *
 * A REMOTE runner reports its OWN detected AI-CLI inventory (the RuntimeInventory shape it produced
 * from the shared pure catalog) so the UI can render that machine's tools. Agent-key auth (resolveAgent,
 * Bearer mc_) - the inventory is stored under the reporting agent/runner id, workspace-scoped. Only the
 * latest report per runner is kept. No secrets or code cross the boundary - just installed/missing flags.
 *
 *   Authorization: Bearer mc_<agent_key>
 *   { "inventory": RuntimeInventory, "runnerName"?: string }
 */
export async function POST(request: Request) {
  try {
    if (!(await isFeatureEnabled(FLAG_KEYS.AI_TOOLS)))
      return errorResponse("AI Tools is not enabled", 403, "FEATURE_DISABLED");
    const agent = await resolveAgent(request);
    if (!agent.workspaceId) return errorResponse("Agent has no workspace", 400);

    const body = (await request.json().catch(() => ({}))) as {
      inventory?: RuntimeInventory;
      runnerName?: unknown;
    };
    if (!body.inventory || typeof body.inventory !== "object")
      return errorResponse("inventory is required", 400, "BAD_REQUEST");

    const saved = await saveReportedInventory({
      workspaceId: agent.workspaceId,
      runnerId: agent.id,
      runnerName: typeof body.runnerName === "string" ? body.runnerName : (agent.name ?? null),
      inventory: body.inventory,
    });
    return successResponse({ ok: true, runnerId: saved.runnerId, reportedAt: saved.reportedAt });
  } catch (err) {
    return handleError(err);
  }
}
