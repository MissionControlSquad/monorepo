/**
 * Tier D: control-plane memory layer (the `db` provider's storage + provenance). The binding
 * (agent.memoryProvider) is owned here; this service stores/reads entries for the `db` provider.
 * For `none`/`markdown` providers nothing is stored control-plane-side.
 */
import { prisma } from "@/server/prisma";
import type { AgentMemory } from "@agentcenter/database";

const MAX_INJECT_CHARS = 8_000;

/** Append a memory entry produced by a task run (provenance = sourceTaskId). */
export async function appendAgentMemory(input: {
  workspaceId: string;
  agentId: string;
  content: string;
  sourceTaskId?: string | null;
}): Promise<AgentMemory> {
  return prisma.agentMemory.create({
    data: {
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      content: input.content,
      sourceTaskId: input.sourceTaskId ?? null,
    },
  });
}

/** The most recent memory entries for an agent (newest first). */
export async function readAgentMemory(
  workspaceId: string,
  agentId: string,
  limit = 20,
): Promise<AgentMemory[]> {
  return prisma.agentMemory.findMany({
    where: { workspaceId, agentId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });
}

/**
 * Assemble the memory text to inject into a task's context for the `db` provider: recent entries,
 * oldest-first, capped. Returns null when there's nothing to inject.
 */
export async function assembleInjectedMemory(
  workspaceId: string,
  agentId: string,
): Promise<string | null> {
  const rows = await readAgentMemory(workspaceId, agentId, 20);
  if (rows.length === 0) return null;
  const text = rows
    .reverse()
    .map((r) => r.content)
    .join("\n\n---\n\n");
  return text.length > MAX_INJECT_CHARS ? text.slice(-MAX_INJECT_CHARS) : text;
}
