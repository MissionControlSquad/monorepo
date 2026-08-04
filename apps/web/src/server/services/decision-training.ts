import { prisma } from "@/server/prisma";
import { GraphQLError } from "graphql";
import type { DecisionRecord } from "@agentcenter/database";
import { redactSensitive } from "@agentcenter/utils";

// Decision-training capture (parity #40). Record notable agent decisions (context/choice/outcome) for
// downstream training/eval. Context is redacted of secrets/PII on capture (reuses redactSensitive).

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}
const OUTCOMES = new Set(["success", "failure", "mixed", "unknown"]);

export async function recordDecision(input: {
  workspaceId: string;
  agentId?: string | null;
  taskId?: string | null;
  decisionType: string;
  context: string;
  choice: string;
  rationale?: string | null;
}): Promise<DecisionRecord> {
  const decisionType = input.decisionType.trim();
  const choice = input.choice.trim();
  if (!decisionType) badRequest("decisionType is required");
  if (!choice) badRequest("choice is required");
  return prisma.decisionRecord.create({
    data: {
      workspaceId: input.workspaceId,
      agentId: input.agentId ?? null,
      taskId: input.taskId ?? null,
      decisionType,
      context: redactSensitive(input.context ?? "").slice(0, 8_000),
      choice,
      rationale: input.rationale ? redactSensitive(input.rationale).slice(0, 4_000) : null,
    },
  });
}

/** Backfill the observed outcome for a captured decision. */
export async function setDecisionOutcome(
  workspaceId: string,
  id: string,
  outcome: string,
): Promise<DecisionRecord> {
  if (!OUTCOMES.has(outcome)) badRequest("outcome must be success|failure|mixed|unknown");
  const existing = await prisma.decisionRecord.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!existing) badRequest("decision not found");
  return prisma.decisionRecord.update({ where: { id }, data: { outcome } });
}

export function listDecisions(
  workspaceId: string,
  filter: { decisionType?: string | null; agentId?: string | null; limit?: number } = {},
): Promise<DecisionRecord[]> {
  return prisma.decisionRecord.findMany({
    where: {
      workspaceId,
      ...(filter.decisionType ? { decisionType: filter.decisionType } : {}),
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(filter.limit ?? 100, 1), 500),
  });
}
