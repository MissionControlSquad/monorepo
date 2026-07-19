import { resolveAgent } from "../../_lib/resolve-agent";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { claimCommandsForAgent } from "@/server/services/runner-commands";

// Tier D (Slice 2): a runner daemon polls its queued commands. Agent-key auth (resolveAgent).
// Atomically claims the queued rows (queued → running) so two pollers can't double-run. NAT-safe:
// the daemon only makes an outbound GET — no inbound reachability required.
export async function GET(request: Request) {
  try {
    if (!(await isFeatureEnabled(FLAG_KEYS.RUNNERS)))
      return errorResponse("Runners are not enabled", 403, "FEATURE_DISABLED");
    const agent = await resolveAgent(request);
    if (!agent.workspaceId) return errorResponse("Agent has no workspace", 400);

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit")) || 10;
    const commands = await claimCommandsForAgent(agent.id, agent.workspaceId, limit);
    return successResponse({
      commands: commands.map((c) => ({
        id: c.id,
        command: c.command,
        cwd: c.cwd,
        timeoutMs: c.timeoutMs,
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
