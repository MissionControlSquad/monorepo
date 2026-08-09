import { prisma } from "@/server/prisma";
import { GraphQLError } from "graphql";
import type { ToolContentGuard } from "@agentcenter/database";
import {
  applyContentGuards,
  type ContentGuardResult,
  type ContentGuardRule,
  type GuardDirection,
} from "@agentcenter/utils";

// Tool content-guard service (parity #163). Persists the rules + evaluates tool I/O via the pure
// evaluator. ENFORCEMENT belongs to the tool runtime (absent) — this is the storage + query half.

const ACTIONS = new Set(["deny", "redact"]);
const DIRECTIONS = new Set(["input", "output", "both"]);

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

function toRule(row: ToolContentGuard): ContentGuardRule {
  return {
    id: row.id,
    pattern: row.pattern,
    action: row.action === "deny" ? "deny" : "redact",
    appliesTo: (DIRECTIONS.has(row.appliesTo) ? row.appliesTo : "both") as GuardDirection,
    priority: row.priority,
  };
}

export function listToolContentGuards(workspaceId: string): Promise<ToolContentGuard[]> {
  return prisma.toolContentGuard.findMany({
    where: { workspaceId },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function setToolContentGuard(input: {
  id?: string | null;
  workspaceId: string;
  pattern: string;
  action: string;
  appliesTo?: string;
  priority?: number;
  reason?: string | null;
}): Promise<ToolContentGuard> {
  const pattern = input.pattern.trim();
  if (!pattern) badRequest("pattern is required");
  if (!ACTIONS.has(input.action)) badRequest("action must be 'deny' or 'redact'");
  const appliesTo = input.appliesTo && DIRECTIONS.has(input.appliesTo) ? input.appliesTo : "both";
  const data = {
    pattern,
    action: input.action,
    appliesTo,
    priority: input.priority ?? 0,
    reason: input.reason ?? null,
  };
  if (input.id) {
    const existing = await prisma.toolContentGuard.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
      select: { id: true },
    });
    if (!existing) badRequest("guard not found");
    return prisma.toolContentGuard.update({ where: { id: input.id }, data });
  }
  return prisma.toolContentGuard.create({ data: { workspaceId: input.workspaceId, ...data } });
}

export async function deleteToolContentGuard(id: string, workspaceId: string): Promise<boolean> {
  const res = await prisma.toolContentGuard.deleteMany({ where: { id, workspaceId } });
  return res.count > 0;
}

/** Evaluate a tool input/output against the workspace's content guards. */
export async function evaluateToolContent(
  workspaceId: string,
  text: string,
  direction: "input" | "output",
): Promise<ContentGuardResult> {
  const rows = await prisma.toolContentGuard.findMany({ where: { workspaceId } });
  return applyContentGuards(rows.map(toRule), text, direction);
}
