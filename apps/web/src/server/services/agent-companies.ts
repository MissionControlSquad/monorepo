/**
 * Agent-Companies service (Domain 14 #10 foundation). CRUD for the first-order org entity of the
 * Paperclip agentcompanies/v1 model + binding agents into a company. Workspace-scoped. The markdown
 * COMPANY.md package parser/emitter + import graph (#11/#12) build on this entity.
 */
import { prisma } from "@/server/prisma";
import { GraphQLError } from "graphql";
import {
  slugify as coreSlugify,
  emitCompanyMarkdown,
  emitAgentMarkdown,
  renderOrgChartMermaid,
} from "@agentcenter/utils";
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

/**
 * Export a company as a portable markdown package (Domain 14 #12): COMPANY.md + agents/<slug>/AGENTS.md
 * per member agent + a README.md with a Mermaid org chart. Returns a path→content file map. Pure
 * emitters live in @agentcenter/utils. Secrets/keys are never emitted (only org structure + persona).
 */
export async function exportCompanyPackage(
  workspaceId: string,
  companyId: string,
): Promise<{ path: string; content: string }[]> {
  const company = await prisma.agentCompany.findFirst({ where: { id: companyId, workspaceId } });
  if (!company) throw new GraphQLError("Company not found", { extensions: { code: "NOT_FOUND" } });

  const agents = await prisma.agent.findMany({
    where: { companyId, workspaceId },
    select: { id: true, name: true, role: true, personality: true, reportsToAgentId: true },
    orderBy: { name: "asc" },
  });
  const slugFor = (name: string) => coreSlugify(name, 40, "agent");
  const idToSlug = new Map(agents.map((a) => [a.id, slugFor(a.name)]));

  const files: { path: string; content: string }[] = [
    {
      path: "COMPANY.md",
      content: emitCompanyMarkdown({
        name: company.name,
        slug: company.slug,
        description: company.description,
        goals: company.goals,
        license: company.license,
        schemaVersion: company.schemaVersion,
      }),
    },
  ];

  for (const a of agents) {
    const slug = idToSlug.get(a.id)!;
    files.push({
      path: `agents/${slug}/AGENTS.md`,
      content: emitAgentMarkdown({
        name: a.name,
        role: a.role,
        slug,
        reportsTo: a.reportsToAgentId ? (idToSlug.get(a.reportsToAgentId) ?? null) : null,
        personality: a.personality,
      }),
    });
  }

  const mermaid = renderOrgChartMermaid(
    agents.map((a) => ({
      slug: idToSlug.get(a.id)!,
      name: a.name,
      reportsTo: a.reportsToAgentId ? (idToSlug.get(a.reportsToAgentId) ?? null) : null,
    })),
  );
  files.push({
    path: "README.md",
    content: `# ${company.name}\n\n${company.description ?? ""}\n\n## Org chart\n\n${mermaid}\n`,
  });

  return files;
}
