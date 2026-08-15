import { withAgent } from "../../../../_lib/with-agent";
import { successResponse, errorResponse } from "../../../../_lib/json-response";
import { FLAG_KEYS } from "@agentcenter/utils";
import { recordCommandResult } from "@/server/services/runner-commands";

// Tier D (Slice 2): a runner daemon posts the result of a command it claimed. Agent-key auth;
// the result is scoped to the agent + only accepted while the command is running.
export const POST = withAgent(
  async (request, agent, { params }: { params: Promise<{ id: string }> }) => {
    if (!agent.workspaceId) return errorResponse("Agent has no workspace", 400);
    const { id } = await params;

    const body = (await request.json()) as {
      exitCode?: number | null;
      stdout?: string | null;
      stderr?: string | null;
      status?: "done" | "failed" | "timeout" | null;
      errorMessage?: string | null;
    };

    const cmd = await recordCommandResult(agent.id, agent.workspaceId, id, {
      exitCode: body.exitCode,
      stdout: body.stdout,
      stderr: body.stderr,
      status: body.status,
      errorMessage: body.errorMessage,
    });
    return successResponse({ ok: true, id: cmd.id, status: cmd.status });
  },
  { feature: { flag: FLAG_KEYS.RUNNERS, error: "Runners are not enabled" } },
);
