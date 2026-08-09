/**
 * Agent instructions — AGENTS.md bundles (Epic #18). A per-agent set of named markdown instruction
 * files. Closes the "Easy AGENTS.md configurations" parity gap. Ports Paperclip
 * `default-agent-instructions.ts` (`DEFAULT_AGENT_BUNDLE_FILES`). Filesystem sync into a live agent is
 * deferred (spec D2).
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import {
  DEFAULT_AGENTS_MD,
  defaultBundleFor,
  isValidInstructionFileName,
} from "@agentcenter/utils";
import type { AgentInstruction } from "@agentcenter/database";

// Default bundles + file-name validation are shared in @agentcenter/utils (web/desktop/mobile).
export {
  DEFAULT_AGENTS_MD,
  defaultBundleFor,
  isValidInstructionFileName,
} from "@agentcenter/utils";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/** Fetch the agent workspace-scoped, or reject — every op funnels through here. */
async function requireAgent(
  workspaceId: string,
  agentId: string,
): Promise<{ id: string; role: string }> {
  const agent = await prisma.agent.findFirst({
    where: { workspaceId, id: agentId },
    select: { id: true, role: true },
  });
  if (!agent) badRequest("agentId does not reference an agent in this workspace");
  return agent;
}

export async function listInstructions(
  workspaceId: string,
  agentId: string,
): Promise<AgentInstruction[]> {
  await requireAgent(workspaceId, agentId);
  return prisma.agentInstruction.findMany({ where: { agentId }, orderBy: { fileName: "asc" } });
}

export async function upsertInstruction(args: {
  workspaceId: string;
  agentId: string;
  fileName: string;
  content: string;
  updatedByProfileId?: string | null;
}): Promise<AgentInstruction> {
  await requireAgent(args.workspaceId, args.agentId);
  if (!isValidInstructionFileName(args.fileName)) badRequest("Invalid instruction file name");
  return prisma.agentInstruction.upsert({
    where: { agentId_fileName: { agentId: args.agentId, fileName: args.fileName } },
    create: {
      agentId: args.agentId,
      fileName: args.fileName,
      content: args.content,
      updatedByProfileId: args.updatedByProfileId ?? null,
    },
    update: { content: args.content, updatedByProfileId: args.updatedByProfileId ?? null },
  });
}

export async function deleteInstruction(
  workspaceId: string,
  agentId: string,
  fileName: string,
): Promise<boolean> {
  await requireAgent(workspaceId, agentId);
  const existing = await prisma.agentInstruction.findUnique({
    where: { agentId_fileName: { agentId, fileName } },
    select: { id: true },
  });
  if (!existing) badRequest("Instruction file not found");
  await prisma.agentInstruction.delete({ where: { id: existing.id } });
  return true;
}

/** Idempotently create any missing files in the agent's role default bundle. Returns the full bundle. */
export async function seedDefaultInstructions(
  workspaceId: string,
  agentId: string,
  updatedByProfileId?: string | null,
): Promise<AgentInstruction[]> {
  const agent = await requireAgent(workspaceId, agentId);
  const wanted = defaultBundleFor(agent.role);
  const existing = await prisma.agentInstruction.findMany({
    where: { agentId },
    select: { fileName: true },
  });
  const have = new Set(existing.map((e) => e.fileName));
  const toCreate = wanted.filter((f) => !have.has(f));
  if (toCreate.length > 0) {
    await prisma.agentInstruction.createMany({
      data: toCreate.map((fileName) => ({
        agentId,
        fileName,
        content: fileName === "AGENTS.md" ? DEFAULT_AGENTS_MD : `# ${fileName}\n\n`,
        updatedByProfileId: updatedByProfileId ?? null,
      })),
    });
  }
  return prisma.agentInstruction.findMany({ where: { agentId }, orderBy: { fileName: "asc" } });
}
