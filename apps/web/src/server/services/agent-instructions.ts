/**
 * Agent instructions — AGENTS.md bundles (Epic #18). A per-agent set of named markdown instruction
 * files. Closes the "Easy AGENTS.md configurations" parity gap. Ports Paperclip
 * `default-agent-instructions.ts` (`DEFAULT_AGENT_BUNDLE_FILES`). Filesystem sync into a live agent is
 * deferred (spec D2).
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { AgentInstruction } from "@agentcenter/database";

/** Default bundle file sets, ported from Paperclip DEFAULT_AGENT_BUNDLE_FILES. */
const DEFAULT_BUNDLE = ["AGENTS.md"];
const CEO_BUNDLE = ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"];

export const DEFAULT_AGENTS_MD =
  "# AGENTS.md\n\n" +
  "## Role\nDescribe what this agent is responsible for.\n\n" +
  "## Guidelines\n- Be concise and act autonomously within your remit.\n- Ask for approval before " +
  "irreversible or costly actions.\n\n## Tools\nList the tools and skills this agent should use.\n";

/** Pure: which default files an agent of this role/level should start with. */
export function defaultBundleFor(role: string | null | undefined): string[] {
  const r = (role ?? "").toLowerCase();
  return r.includes("ceo") || r.includes("chief") ? [...CEO_BUNDLE] : [...DEFAULT_BUNDLE];
}

const MAX_FILENAME = 64;

/** Pure: a safe instruction file name — a plain `*.md` basename, no path separators or traversal. */
export function isValidInstructionFileName(name: string): boolean {
  if (!name || name.length > MAX_FILENAME) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name.includes("..")) return false;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return false;
  return name.toLowerCase().endsWith(".md");
}

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
