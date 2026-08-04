import { prisma } from "@/server/prisma";
import type { ProductivityReview } from "@agentcenter/database";
import { assessProductivity, type ProductivitySignals } from "@agentcenter/utils";

// Productivity review service (parity #132). The heartbeat's watchdog calls reviewAgentProductivity with
// an agent's recent signals; the pure assessor decides the verdict and we persist the review. Downstream
// nudges/escalations read the latest verdict. Workspace-scoped.

/** Assess + persist a productivity review for an agent. */
export async function reviewAgentProductivity(input: {
  workspaceId: string;
  agentId: string;
  signals: ProductivitySignals;
  thresholds?: { idleStuckMs?: number; taskDragMs?: number };
}): Promise<ProductivityReview> {
  const result = assessProductivity(input.signals, input.thresholds ?? {});
  return prisma.productivityReview.create({
    data: {
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      verdict: result.verdict,
      score: result.score,
      reasons: result.reasons,
      signals: input.signals as never,
    },
  });
}

/** The latest productivity review for an agent (what a nudge/escalation acts on). */
export function latestProductivityReview(
  workspaceId: string,
  agentId: string,
): Promise<ProductivityReview | null> {
  return prisma.productivityReview.findFirst({
    where: { workspaceId, agentId },
    orderBy: { createdAt: "desc" },
  });
}

/** Agents currently flagged as stuck or struggling — the watchdog's worklist. */
export async function flaggedAgents(workspaceId: string): Promise<ProductivityReview[]> {
  // Latest review per agent, filtered to unhealthy verdicts. Small N (agents per workspace).
  const recent = await prisma.productivityReview.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const latestByAgent = new Map<string, ProductivityReview>();
  for (const r of recent) if (!latestByAgent.has(r.agentId)) latestByAgent.set(r.agentId, r);
  return [...latestByAgent.values()].filter(
    (r) => r.verdict === "stuck" || r.verdict === "struggling",
  );
}
