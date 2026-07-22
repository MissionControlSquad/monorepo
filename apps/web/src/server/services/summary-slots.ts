import { prisma } from "@/server/prisma";
import type { SummarySlot } from "@agentcenter/database";

// Continuation-summary service (parity #142/#156/#157). A rolling "summary slot" per agent is written
// during a run, FINALIZED at run end (#156), and the latest finalized summary is what a continuation
// run reads (#142). Workspace-scoped. The agent runtime is the eventual writer/reader; this is storage.

const MAX_CONTENT = 16_000;

/** Write (upsert) the active draft summary for an agent's slot — the rolling summary during a run. */
export async function writeSummarySlot(input: {
  workspaceId: string;
  agentId: string;
  slotKey?: string;
  content: string;
  runId?: string | null;
}): Promise<SummarySlot> {
  const slotKey = input.slotKey ?? "context";
  const content = input.content.slice(0, MAX_CONTENT);
  const existing = await prisma.summarySlot.findFirst({
    where: { workspaceId: input.workspaceId, agentId: input.agentId, slotKey, status: "draft" },
    select: { id: true },
  });
  if (existing) {
    return prisma.summarySlot.update({
      where: { id: existing.id },
      data: { content, runId: input.runId ?? null },
    });
  }
  return prisma.summarySlot.create({
    data: {
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      slotKey,
      content,
      status: "draft",
      runId: input.runId ?? null,
    },
  });
}

/**
 * Finalize the draft slot at run end (#156): freeze the current draft as a finalized summary. Returns
 * the finalized row, or null if there was no draft to finalize.
 */
export async function finalizeSummarySlot(
  workspaceId: string,
  agentId: string,
  slotKey = "context",
): Promise<SummarySlot | null> {
  const draft = await prisma.summarySlot.findFirst({
    where: { workspaceId, agentId, slotKey, status: "draft" },
  });
  if (!draft) return null;
  return prisma.summarySlot.update({ where: { id: draft.id }, data: { status: "finalized" } });
}

/** The latest finalized summary for an agent's slot — what a continuation run carries in (#142). */
export function getContinuationSummary(
  workspaceId: string,
  agentId: string,
  slotKey = "context",
): Promise<SummarySlot | null> {
  return prisma.summarySlot.findFirst({
    where: { workspaceId, agentId, slotKey, status: "finalized" },
    orderBy: { updatedAt: "desc" },
  });
}

/** All summary slots for an agent (draft + finalized history), newest first. */
export function listSummarySlots(workspaceId: string, agentId: string): Promise<SummarySlot[]> {
  return prisma.summarySlot.findMany({
    where: { workspaceId, agentId },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
}
