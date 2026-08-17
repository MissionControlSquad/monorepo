import { withAgent } from "../../_lib/with-agent";
import { successResponse, errorResponse } from "../../_lib/json-response";
import { FLAG_KEYS } from "@agentcenter/utils";
import { claimCommandsForAgent } from "@/server/services/runner-commands";

// Tier D (Slice 2): a runner daemon polls its queued commands. Agent-key auth (resolveAgent).
// Atomically claims the queued rows (queued → running) so two pollers can't double-run. NAT-safe:
// the daemon only makes an outbound GET — no inbound reachability required.
export const GET = withAgent(
  async (request, agent) => {
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
  },
  { feature: { flag: FLAG_KEYS.RUNNERS, error: "Runners are not enabled" } },
);
