import { prisma } from "@/server/prisma";
import type { Feedback } from "@agentcenter/database";
import { redactSensitive } from "@agentcenter/utils";
import { badRequest } from "./service-errors";

// Feedback service (parity #60/#61/#62). Capture thumbs-up/down + an optional comment on a target;
// comments are REDACTED of secrets/PII before storage (#61). Workspace-scoped.

const TARGET_TYPES = new Set(["task", "deliverable", "agent", "general"]);
const RATINGS = new Set(["up", "down"]);
const MAX_COMMENT = 4_000;

export async function submitFeedback(input: {
  workspaceId: string;
  targetType: string;
  targetId?: string | null;
  rating: string;
  comment?: string | null;
  submittedByProfileId?: string | null;
}): Promise<Feedback> {
  if (!TARGET_TYPES.has(input.targetType))
    badRequest(`Unknown feedback target '${input.targetType}'`);
  if (!RATINGS.has(input.rating)) badRequest("rating must be 'up' or 'down'");
  if (input.targetType !== "general" && !input.targetId?.trim()) {
    badRequest(`${input.targetType} feedback requires a targetId`);
  }

  // #61: never persist raw secrets/PII from a free-text comment.
  const raw = input.comment?.trim();
  const comment = raw ? redactSensitive(raw).slice(0, MAX_COMMENT) : null;

  return prisma.feedback.create({
    data: {
      workspaceId: input.workspaceId,
      targetType: input.targetType,
      targetId: input.targetType === "general" ? null : (input.targetId ?? null),
      rating: input.rating,
      comment,
      submittedByProfileId: input.submittedByProfileId ?? null,
    },
  });
}

/** List feedback for a workspace, optionally filtered by target, newest first. */
export function listFeedback(
  workspaceId: string,
  filter: { targetType?: string | null; targetId?: string | null; limit?: number } = {},
): Promise<Feedback[]> {
  return prisma.feedback.findMany({
    where: {
      workspaceId,
      ...(filter.targetType ? { targetType: filter.targetType } : {}),
      ...(filter.targetId ? { targetId: filter.targetId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(filter.limit ?? 50, 1), 200),
  });
}

/** Up/down tallies for a target (a compact signal for the target's UI). */
export async function feedbackSummary(
  workspaceId: string,
  targetType: string,
  targetId: string,
): Promise<{ up: number; down: number }> {
  const rows = await prisma.feedback.groupBy({
    by: ["rating"],
    where: { workspaceId, targetType, targetId },
    _count: { _all: true },
  });
  const get = (r: string) => rows.find((x) => x.rating === r)?._count._all ?? 0;
  return { up: get("up"), down: get("down") };
}
