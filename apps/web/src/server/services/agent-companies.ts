/**
 * Agent-Companies service (Domain 14 #10 foundation). CRUD for the first-order org entity of the
 * Paperclip agentcompanies/v1 model + binding agents into a company. Workspace-scoped. The markdown
 * COMPANY.md package parser/emitter + import graph (#11/#12) build on this entity.
 */
import { prisma } from "@/server/prisma";
import { GraphQLError } from "graphql";
import { slugify as coreSlugify } from "@agentcenter/utils";
import type { AgentCompany } from "@agentcenter/database";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

export interface CreateCompanyInput {
  workspaceId: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  goals?: string[] | null;
  license?: string | null;
  authors?: unknown;
  sourceRef?: string | null;
  createdByProfileId?: string | null;
}

export async function createCompany(input: CreateCompanyInput): Promise<AgentCompany> {
  const name = input.name.trim();
  if (!name) badRequest("name is required");
  const slug = (input.slug?.trim() || coreSlugify(name, 64, "company")).toLowerCase();
  const dup = await prisma.agentCompany.findFirst({
    where: { workspaceId: input.workspaceId, slug },
    select: { id: true },
  });
  if (dup) badRequest(`a company with slug "${slug}" already exists`);
  return prisma.agentCompany.create({
    data: {
      workspaceId: input.workspaceId,
      slug,
      name,
      description: input.description ?? null,
      goals: input.goals ?? [],
      license: input.license ?? null,
      authors: (input.authors ?? undefined) as never,
      sourceRef: input.sourceRef ?? null,
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });
}

export function listCompanies(workspaceId: string): Promise<AgentCompany[]> {
  return prisma.agentCompany.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
}

export function getCompany(workspaceId: string, id: string): Promise<AgentCompany | null> {
  return prisma.agentCompany.findFirst({ where: { id, workspaceId } });
}

export async function updateCompany(
  workspaceId: string,
  id: string,
  patch: {
    name?: string | null;
    description?: string | null;
    goals?: string[] | null;
    license?: string | null;
  },
): Promise<AgentCompany> {
  const existing = await prisma.agentCompany.findFirst({ where: { id, workspaceId } });
  if (!existing) throw new GraphQLError("Company not found", { extensions: { code: "NOT_FOUND" } });
  return prisma.agentCompany.update({
    where: { id },
    data: {
      ...(patch.name != null ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.goals != null ? { goals: patch.goals } : {}),
      ...(patch.license !== undefined ? { license: patch.license } : {}),
    },
  });
}

/** Delete a company. Member agents are NOT deleted — their companyId is cleared (soft link). */
export async function deleteCompany(workspaceId: string, id: string): Promise<boolean> {
  const existing = await prisma.agentCompany.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!existing) return false;
  await prisma.$transaction([
    prisma.agent.updateMany({ where: { companyId: id, workspaceId }, data: { companyId: null } }),
    prisma.agentCompany.delete({ where: { id } }),
  ]);
  return true;
}

/** Bind (or unbind, companyId=null) an agent to a company. Both must be in the workspace. */
export async function setAgentCompany(
  workspaceId: string,
  agentId: string,
  companyId: string | null,
): Promise<void> {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, workspaceId },
    select: { id: true },
  });
  if (!agent) throw new GraphQLError("Agent not found", { extensions: { code: "NOT_FOUND" } });
  if (companyId) {
    const company = await prisma.agentCompany.findFirst({
      where: { id: companyId, workspaceId },
      select: { id: true },
    });
    if (!company)
      throw new GraphQLError("Company not found", { extensions: { code: "NOT_FOUND" } });
  }
  await prisma.agent.update({ where: { id: agentId }, data: { companyId } });
}
