import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { ToolInvocation } from "@agentcenter/database";

// Tool runtime metrics service (parity #167). Record one row per tool invocation (outcome + latency +
// error kind) and aggregate it into a per-tool health view: call count, success/error/denied split,
// latency percentiles, and an error-kind breakdown. The tool runtime is the writer; dashboards read.
// Workspace-scoped.

const OUTCOMES = new Set(["success", "error", "denied"]);

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/** Record a single tool invocation. */
export async function recordToolInvocation(input: {
  workspaceId: string;
  agentId?: string | null;
  runId?: string | null;
  toolName: string;
  outcome: string;
  durationMs?: number;
  errorKind?: string | null;
}): Promise<ToolInvocation> {
  const toolName = input.toolName?.trim();
  if (!toolName) badRequest("toolName is required");
  if (!OUTCOMES.has(input.outcome)) badRequest("outcome must be one of: success, error, denied");
  const durationMs = Math.max(0, Math.round(input.durationMs ?? 0));
  return prisma.toolInvocation.create({
    data: {
      workspaceId: input.workspaceId,
      agentId: input.agentId ?? null,
      runId: input.runId ?? null,
      toolName,
      outcome: input.outcome,
      durationMs,
      errorKind: input.outcome === "error" ? (input.errorKind ?? null) : null,
    },
  });
}

/** Nearest-rank percentile of an ascending-sorted array (0 for empty). */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  return sortedAsc[Math.min(sortedAsc.length, Math.max(1, rank)) - 1];
}

export interface ToolMetrics {
  toolName: string;
  calls: number;
  success: number;
  error: number;
  denied: number;
  successRate: number; // success / calls, 0..1
  p50DurationMs: number;
  p95DurationMs: number;
  errorKinds: { kind: string; count: number }[];
}

/**
 * Aggregate tool invocations into per-tool metrics over an optional time window (default: last 24h),
 * busiest tool first. `sinceHours` bounds the window; `toolName` narrows to one tool.
 */
export async function toolRuntimeMetrics(
  workspaceId: string,
  opts: { sinceHours?: number; toolName?: string } = {},
): Promise<ToolMetrics[]> {
  const sinceHours = opts.sinceHours ?? 24;
  const since = new Date(Date.now() - sinceHours * 3_600_000);
  const rows = await prisma.toolInvocation.findMany({
    where: {
      workspaceId,
      createdAt: { gte: since },
      ...(opts.toolName ? { toolName: opts.toolName } : {}),
    },
    select: { toolName: true, outcome: true, durationMs: true, errorKind: true },
  });

  const byTool = new Map<
    string,
    {
      durations: number[];
      success: number;
      error: number;
      denied: number;
      errorKinds: Map<string, number>;
    }
  >();
  for (const r of rows) {
    let agg = byTool.get(r.toolName);
    if (!agg) {
      agg = { durations: [], success: 0, error: 0, denied: 0, errorKinds: new Map() };
      byTool.set(r.toolName, agg);
    }
    agg.durations.push(r.durationMs);
    if (r.outcome === "success") agg.success++;
    else if (r.outcome === "denied") agg.denied++;
    else {
      agg.error++;
      const kind = r.errorKind ?? "unknown";
      agg.errorKinds.set(kind, (agg.errorKinds.get(kind) ?? 0) + 1);
    }
  }

  return [...byTool.entries()]
    .map(([toolName, agg]) => {
      const calls = agg.durations.length;
      const sorted = agg.durations.slice().sort((a, b) => a - b);
      return {
        toolName,
        calls,
        success: agg.success,
        error: agg.error,
        denied: agg.denied,
        successRate: calls ? agg.success / calls : 0,
        p50DurationMs: percentile(sorted, 50),
        p95DurationMs: percentile(sorted, 95),
        errorKinds: [...agg.errorKinds.entries()]
          .map(([kind, count]) => ({ kind, count }))
          .sort((a, b) => b.count - a.count),
      };
    })
    .sort((a, b) => b.calls - a.calls);
}
