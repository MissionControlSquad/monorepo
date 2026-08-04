import { prisma } from "@/server/prisma";
import { resolveToolAccess } from "@/server/services/tool-access-policies";
import { evaluateToolContent } from "@/server/services/tool-content-guards";
import { resolvePluginTool } from "@/server/services/plugin-tools";
import { recordToolInvocation } from "@/server/services/tool-runtime-metrics";
import { isPluginEffective, type PluginLifecycleState } from "@agentcenter/utils";

// Tool gateway (parity #164). The single admission point a tool call passes through: it composes the
// access policy (#21), the content guards (#163), plugin-tool routing (#127/#128), and metrics (#167)
// into one decision. The runtime asks the gateway before executing a tool and after producing output;
// the gateway never executes the tool itself. Workspace-scoped.

export interface ToolAdmission {
  allowed: boolean;
  reason: string; // human-readable why (for logs/telemetry)
  /** Guard-processed argument text (redactions applied) when allowed. */
  guardedInput?: string;
  /** For a plugin-provided tool, the owning plugin id the runtime should dispatch to; null = built-in. */
  pluginId: string | null;
  deniedBy?: "access_policy" | "content_guard" | "plugin_disabled";
}

/**
 * Admit (or reject) a tool call before execution. Order: access policy → content guard on the input →
 * plugin routing (and effective-state check). A rejection at any stage short-circuits and is recorded
 * as a `denied` invocation for observability.
 */
export async function admitToolCall(input: {
  workspaceId: string;
  agentId?: string | null;
  runId?: string | null;
  toolName: string;
  inputText?: string;
}): Promise<ToolAdmission> {
  const { workspaceId, toolName } = input;
  const agentId = input.agentId ?? null;

  const record = (outcome: "denied", _reason: string): Promise<unknown> =>
    recordToolInvocation({
      workspaceId,
      agentId,
      runId: input.runId,
      toolName,
      outcome,
      errorKind: undefined,
    });

  // 1. Access policy (allow/deny by tool name + scope).
  const access = await resolveToolAccess(workspaceId, agentId, toolName);
  if (access.decision === "deny") {
    await record("denied", "access_policy");
    return {
      allowed: false,
      reason: "blocked by tool access policy",
      pluginId: null,
      deniedBy: "access_policy",
    };
  }

  // 2. Content guard on the input (deny short-circuits; redact rewrites).
  let guardedInput = input.inputText ?? "";
  if (input.inputText) {
    const guard = await evaluateToolContent(workspaceId, input.inputText, "input");
    if (guard.decision === "deny") {
      await record("denied", "content_guard");
      return {
        allowed: false,
        reason: "blocked by content guard",
        pluginId: null,
        deniedBy: "content_guard",
      };
    }
    guardedInput = guard.text;
  }

  // 3. Plugin routing — if a plugin claims this tool name, it must be an effective plugin.
  const pluginTool = await resolvePluginTool(workspaceId, toolName);
  let pluginId: string | null = null;
  if (pluginTool) {
    const plugin = await prisma.plugin.findUnique({
      where: { workspaceId_pluginId: { workspaceId, pluginId: pluginTool.pluginId } },
      select: { status: true, enabled: true },
    });
    const state: PluginLifecycleState = {
      status: (plugin?.status as PluginLifecycleState["status"]) ?? "error",
      enabled: plugin?.enabled ?? false,
      removed: !plugin,
    };
    if (!isPluginEffective(state)) {
      await record("denied", "plugin_disabled");
      return {
        allowed: false,
        reason: `plugin '${pluginTool.pluginId}' is not active`,
        pluginId: pluginTool.pluginId,
        deniedBy: "plugin_disabled",
      };
    }
    pluginId = pluginTool.pluginId;
  }

  return { allowed: true, reason: "admitted", guardedInput, pluginId };
}

/**
 * Guard a tool's output before it is returned to the model, and record the completed invocation with
 * its latency/outcome. Returns the guard-processed output text (redactions applied). A deny on output
 * replaces the payload with a blocked marker rather than leaking it.
 */
export async function finalizeToolOutput(input: {
  workspaceId: string;
  agentId?: string | null;
  runId?: string | null;
  toolName: string;
  outputText: string;
  durationMs: number;
  outcome: "success" | "error";
  errorKind?: string | null;
}): Promise<{ outputText: string; blocked: boolean }> {
  const guard = await evaluateToolContent(input.workspaceId, input.outputText, "output");
  const blocked = guard.decision === "deny";
  await recordToolInvocation({
    workspaceId: input.workspaceId,
    agentId: input.agentId ?? null,
    runId: input.runId,
    toolName: input.toolName,
    outcome: input.outcome,
    durationMs: input.durationMs,
    errorKind: input.errorKind,
  });
  return {
    outputText: blocked ? "[tool output blocked by content guard]" : guard.text,
    blocked,
  };
}
