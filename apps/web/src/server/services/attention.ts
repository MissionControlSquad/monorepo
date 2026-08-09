/**
 * Attention feed (Epic #20) — DB aggregation. The severity/source vocabulary + ranking are shared in
 * @agentcenter/utils (web/desktop/mobile); this file only gathers rows and shapes items.
 */
import { prisma } from "@/server/prisma";
import {
  ATTENTION_SEVERITY,
  ATTENTION_SOURCE_KIND,
  IncidentThreshold,
  rankAndCount,
  type AttentionItem,
  type AttentionFeed,
} from "@agentcenter/utils";
import { getAgentOrgChainHealth } from "./org-chart";

export type { AttentionItem, AttentionFeed } from "@agentcenter/utils";

/** Epic #20b: hide a feed item (by its stable key) until it naturally leaves the feed. Idempotent. */
export async function dismissAttentionItem(
  workspaceId: string,
  itemKey: string,
  dismissedByProfileId?: string | null,
  snoozedUntil?: Date | null,
): Promise<boolean> {
  await prisma.attentionDismissal.upsert({
    where: { workspaceId_itemKey: { workspaceId, itemKey } },
    create: {
      workspaceId,
      itemKey,
      dismissedByProfileId: dismissedByProfileId ?? null,
      snoozedUntil: snoozedUntil ?? null,
    },
    update: { snoozedUntil: snoozedUntil ?? null },
  });
  return true;
}

/** Undo a dismissal. Idempotent. */
export async function undismissAttentionItem(
  workspaceId: string,
  itemKey: string,
): Promise<boolean> {
  await prisma.attentionDismissal.deleteMany({ where: { workspaceId, itemKey } });
  return true;
}

export async function getAttentionFeed(
  workspaceId: string,
  includeDismissed = false,
): Promise<AttentionFeed> {
  const [approvals, incidents, blockedTasks, agents, dismissals] = await Promise.all([
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
    includeDismissed
      ? Promise.resolve([] as { itemKey: string; snoozedUntil: Date | null }[])
      : prisma.attentionDismissal.findMany({
          where: { workspaceId },
          select: { itemKey: true, snoozedUntil: true },
        }),
  ]);
  // A dismissal hides an item if it is permanent (snoozedUntil null) or still snoozed (in the future).
  // An expired snooze is ignored, so the item re-surfaces.
  const now = Date.now();
  const dismissed = new Set(
    dismissals
      .filter((d) => d.snoozedUntil == null || d.snoozedUntil.getTime() > now)
      .map((d) => d.itemKey),
  );

  const items: AttentionItem[] = [];

  for (const a of approvals) {
    items.push({
      id: `approval:${a.id}`,
      sourceKind: ATTENTION_SOURCE_KIND.APPROVAL,
      severity: ATTENTION_SEVERITY.HIGH,
      subjectKind: "approval",
      subjectId: a.id,
      title: a.title,
      whyNow: "Awaiting your decision",
      activityAt: a.updatedAt.toISOString(),
    });
  }

  for (const inc of incidents) {
    const hard = inc.thresholdType === IncidentThreshold.HARD;
    items.push({
      id: `incident:${inc.id}`,
      sourceKind: ATTENTION_SOURCE_KIND.BUDGET_ALERT,
      severity: hard ? ATTENTION_SEVERITY.CRITICAL : ATTENTION_SEVERITY.HIGH,
      subjectKind: "budget_incident",
      subjectId: inc.id,
      title: `Budget ${hard ? "breach" : "warning"} — $${(inc.spendCents / 100).toFixed(2)} of $${(inc.limitCents / 100).toFixed(2)}`,
      whyNow: hard
        ? "A hard budget limit was breached; agents may be paused"
        : "A soft budget threshold was crossed",
      activityAt: inc.createdAt.toISOString(),
    });
  }

  for (const t of blockedTasks) {
    items.push({
      id: `task:${t.id}`,
      sourceKind: ATTENTION_SOURCE_KIND.BLOCKER_ATTENTION,
      severity: ATTENTION_SEVERITY.MEDIUM,
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
        sourceKind: ATTENTION_SOURCE_KIND.AGENT_ERROR_ALERT,
        severity: ATTENTION_SEVERITY.HIGH,
        subjectKind: "agent",
        subjectId: a.id,
        title: `${a.name}: ${health.reason.replace("_", " ")}`,
        whyNow: "This agent's reporting chain is invalid",
        activityAt: nowIso,
      });
    }
  }

  return rankAndCount(dismissed.size ? items.filter((it) => !dismissed.has(it.id)) : items);
}
