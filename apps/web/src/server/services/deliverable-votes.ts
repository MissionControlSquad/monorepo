/**
 * Tier C: lightweight up/down votes on deliverables — a quality/prioritization signal, one vote per
 * member. Distinct from the formal Approval workflow. A vote of 0 clears the member's vote.
 */
import { prisma } from "@/server/prisma";
import { badRequest } from "./service-errors";

export interface VoteSummary {
  score: number; // up − down
  upCount: number;
  downCount: number;
  myVote: number; // this voter's current vote: 1, -1, or 0
}

/** Aggregate votes for a deliverable, including the given voter's own current vote. */
export async function voteSummary(deliverableId: string, voterId: string): Promise<VoteSummary> {
  const votes = await prisma.deliverableVote.findMany({
    where: { deliverableId },
    select: { voterId: true, value: true },
  });
  let upCount = 0;
  let downCount = 0;
  let myVote = 0;
  for (const v of votes) {
    if (v.value > 0) upCount++;
    else if (v.value < 0) downCount++;
    if (v.voterId === voterId) myVote = v.value;
  }
  return { score: upCount - downCount, upCount, downCount, myVote };
}

/**
 * Cast (or clear) a member's vote. value must be 1, -1, or 0 (clear). Idempotent per member: the
 * unique (deliverableId, voterId) means re-voting replaces the prior vote. Returns the new summary.
 */
export async function castVote(args: {
  deliverableId: string;
  voterId: string;
  value: number;
}): Promise<VoteSummary> {
  if (![1, -1, 0].includes(args.value)) badRequest("vote must be 1, -1, or 0");
  const deliverable = await prisma.deliverable.findUnique({
    where: { id: args.deliverableId },
    select: { id: true },
  });
  if (!deliverable) badRequest("deliverable not found");

  if (args.value === 0) {
    await prisma.deliverableVote.deleteMany({
      where: { deliverableId: args.deliverableId, voterId: args.voterId },
    });
  } else {
    await prisma.deliverableVote.upsert({
      where: {
        deliverableId_voterId: { deliverableId: args.deliverableId, voterId: args.voterId },
      },
      create: { deliverableId: args.deliverableId, voterId: args.voterId, value: args.value },
      update: { value: args.value },
    });
  }
  return voteSummary(args.deliverableId, args.voterId);
}
