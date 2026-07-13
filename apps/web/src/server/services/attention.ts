/**
 * Attention feed (Epic #20). One ranked, severity-tagged feed of "what needs you now", computed over
 * existing entities — pending approvals, open budget incidents, blocked tasks, and broken org chains
 * (via #19). Read-only; no new tables. Ports Paperclip `types/attention.ts` (subset with real data).
 */
import { prisma } from "@/server/prisma";
import { getAgentOrgChainHealth } from "./org-chart";

export type AttentionSeverity = "critical" | "high" | "medium" | "low";
export type AttentionSourceKind =
  "approval" | "budget_alert" | "blocker_attention" | "agent_error_alert";

export interface AttentionItem {
  id: string;
  sourceKind: AttentionSourceKind;
  severity: AttentionSeverity;
  subjectKind: string;
  subjectId: string;
  title: string;
  whyNow: string;
  activityAt: string; // ISO
}
export interface AttentionFeed {
  totalCount: number;
  countsBySourceKind: Record<string, number>;
  items: AttentionItem[];
}

const SEVERITY_ORDER: Record<AttentionSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Pure: lower rank = more urgent. Unknown severities sort last. */
export function severityRank(sev: string): number {
  return SEVERITY_ORDER[sev as AttentionSeverity] ?? 99;
}

/** Pure: sort items (severity, then recency desc) + compute totals/counts. */
export function rankAndCount(items: AttentionItem[]): AttentionFeed {
  const sorted = [...items].sort((a, b) => {
    const s = severityRank(a.severity) - severityRank(b.severity);
    if (s !== 0) return s;
    return b.activityAt.localeCompare(a.activityAt);
  });
  const countsBySourceKind: Record<string, number> = {};
  for (const it of sorted) {
    countsBySourceKind[it.sourceKind] = (countsBySourceKind[it.sourceKind] ?? 0) + 1;
  }
  return { totalCount: sorted.length, countsBySourceKind, items: sorted };
}

export async function getAttentionFeed(workspaceId: string): Promise<AttentionFeed> {
  const [approvals, incidents, blockedTasks, agents] = await Promise.all([
    prisma.approval.findMany({
      where: { workspaceId, status: "pending" },
      select: { id: true, title: true, updatedAt: true },
    }),
    prisma.budgetIncident.findMany({
      where: { workspaceId, status: "open" },
      select: {
        id: true,
        thresholdType: true,
        spendCents: true,
        limitCents: true,
        createdAt: true,
      },
    }),
    prisma.task.findMany({
      where: { status: "blocked", project: { workspaceId } },
      select: { id: true, title: true, updatedAt: true },
    }),
    prisma.agent.findMany({
      where: { workspaceId },
      select: { id: true, name: true, reportsToAgentId: true },
    }),
  ]);

  const items: AttentionItem[] = [];

  for (const a of approvals) {
    items.push({
      id: `approval:${a.id}`,
      sourceKind: "approval",
      severity: "high",
      subjectKind: "approval",
      subjectId: a.id,
      title: a.title,
      whyNow: "Awaiting your decision",
      activityAt: a.updatedAt.toISOString(),
    });
  }

  for (const inc of incidents) {
    items.push({
      id: `incident:${inc.id}`,
      sourceKind: "budget_alert",
      severity: inc.thresholdType === "hard" ? "critical" : "high",
      subjectKind: "budget_incident",
      subjectId: inc.id,
      title: `Budget ${inc.thresholdType === "hard" ? "breach" : "warning"} — $${(inc.spendCents / 100).toFixed(2)} of $${(inc.limitCents / 100).toFixed(2)}`,
      whyNow:
        inc.thresholdType === "hard"
          ? "A hard budget limit was breached; agents may be paused"
          : "A soft budget threshold was crossed",
      activityAt: inc.createdAt.toISOString(),
    });
  }

  for (const t of blockedTasks) {
    items.push({
      id: `task:${t.id}`,
      sourceKind: "blocker_attention",
      severity: "medium",
      subjectKind: "issue",
      subjectId: t.id,
      title: t.title,
      whyNow: "Task is blocked",
      activityAt: t.updatedAt.toISOString(),
    });
  }

  // Broken org chains (cycle / missing manager) — reuse the #19 health algorithm.
  const orgAgents = agents.map((a) => ({
    id: a.id,
    name: a.name,
    reportsToAgentId: a.reportsToAgentId,
  }));
  const nowIso = new Date().toISOString();
  for (const a of agents) {
    const health = getAgentOrgChainHealth(a.id, orgAgents);
    if (health.status !== "healthy") {
      items.push({
        id: `orgchain:${a.id}`,
        sourceKind: "agent_error_alert",
        severity: "high",
        subjectKind: "agent",
        subjectId: a.id,
        title: `${a.name}: ${health.reason.replace("_", " ")}`,
        whyNow: "This agent's reporting chain is invalid",
        activityAt: nowIso,
      });
    }
  }

  return rankAndCount(items);
}
