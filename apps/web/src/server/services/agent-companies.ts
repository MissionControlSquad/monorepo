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
  parseCompanyPackageFiles,
} from "@agentcenter/utils";
import type { AgentCompany } from "@agentcenter/database";
import { provisionSetupStatus } from "./agent-governance";
import { badRequest } from "./service-errors";

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

// ── Company search (parity #31–33) ──────────────────────────────────────────

export interface CompanySearchHit {
  company: AgentCompany;
  score: number;
  /** Which fields matched (extraction, #32) — for highlighting on the companies page. */
  matchedFields: string[];
}

// Pure scorer (#31/#32): name matches weigh most, then goals, then description. A hit needs every
// search term to appear somewhere. Returns the score + the distinct fields that matched.
export function scoreCompany(
  company: { name: string; description?: string | null; goals?: string[] },
  terms: string[],
): { score: number; matchedFields: string[] } {
  const name = company.name.toLowerCase();
  const description = (company.description ?? "").toLowerCase();
  const goals = (company.goals ?? []).join(" ").toLowerCase();
  const fields: [string, string, number][] = [
    ["name", name, 3],
    ["goals", goals, 2],
    ["description", description, 1],
  ];

  const matched = new Set<string>();
  let score = 0;
  for (const term of terms) {
    let termHit = false;
    for (const [field, text, weight] of fields) {
      if (text.includes(term)) {
        score += weight;
        matched.add(field);
        termHit = true;
      }
    }
    if (!termHit) return { score: 0, matchedFields: [] }; // every term must match somewhere
  }
  return { score, matchedFields: [...matched] };
}

// ── Search rate limit (#33) — in-memory, per-workspace ──
const SEARCH_RATE_MAX = 30;
const SEARCH_RATE_WINDOW_MS = 60_000;
const searchBuckets = new Map<string, { count: number; resetAt: number }>();

export function isCompanySearchRateLimited(workspaceId: string, now: number = Date.now()): boolean {
  const bucket = searchBuckets.get(workspaceId);
  if (!bucket || now >= bucket.resetAt) {
    searchBuckets.set(workspaceId, { count: 1, resetAt: now + SEARCH_RATE_WINDOW_MS });
    return false;
  }
  bucket.count++;
  return bucket.count > SEARCH_RATE_MAX;
}

/** Rank the workspace's companies against a free-text query (name/goals/description). */
export async function searchCompanies(
  workspaceId: string,
  query: string,
  limit = 20,
): Promise<CompanySearchHit[]> {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const companies = await listCompanies(workspaceId);
  return companies
    .map((company) => ({ company, ...scoreCompany(company, terms) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.company.name.localeCompare(b.company.name))
    .slice(0, Math.min(Math.max(limit, 1), 100));
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

export interface ImportCompanyResult {
  companyId: string;
  slug: string;
  createdAgentIds: string[];
  warnings: string[];
}

/**
 * Import a company markdown package (Domain 14 #12) into the workspace: creates the AgentCompany
 * (renaming the slug on collision), then one Agent per AGENTS.md, wiring reportsTo by slug within the
 * package. sourceRef records provenance. Never imports secrets. Returns the created ids + warnings.
 */
export async function importCompanyPackage(input: {
  workspaceId: string;
  files: { path: string; content: string }[];
  sourceRef?: string | null;
  createdByProfileId?: string | null;
}): Promise<ImportCompanyResult> {
  const parsed = parseCompanyPackageFiles(input.files);
  if (!parsed.company) badRequest("package has no valid COMPANY.md");
  const spec = parsed.company;

  // Resolve a non-colliding slug.
  const base = (spec.slug || coreSlugify(spec.name, 64, "company")).toLowerCase();
  let slug = base;
  for (
    let i = 2;
    await prisma.agentCompany.findFirst({
      where: { workspaceId: input.workspaceId, slug },
      select: { id: true },
    });
    i++
  )
    slug = `${base}-${i}`;

  const company = await prisma.agentCompany.create({
    data: {
      workspaceId: input.workspaceId,
      slug,
      name: spec.name,
      description: spec.description ?? null,
      goals: spec.goals ?? [],
      license: spec.license ?? null,
      schemaVersion: spec.schemaVersion ?? "agentcompanies/v1",
      sourceRef: input.sourceRef ?? null,
      createdByProfileId: input.createdByProfileId ?? null,
    },
  });

  // Create agents first (no manager), then wire reportsTo by package slug.
  // Governance gate (Domain 14): imported agents honor requireAgentApproval like team-installed and
  // hired agents — they must not auto-activate when the workspace requires admin provisioning.
  const setupStatus = await provisionSetupStatus(input.workspaceId);
  const slugToId = new Map<string, string>();
  const createdAgentIds: string[] = [];
  for (const a of parsed.agents) {
    const agent = await prisma.agent.create({
      data: {
        name: a.name,
        role: a.role,
        workspaceId: input.workspaceId,
        companyId: company.id,
        username: `${coreSlugify(a.name, 40, "agent")}-${company.id.slice(0, 6)}`,
        setupStatus,
      },
    });
    slugToId.set(a.slug || coreSlugify(a.name, 40, "agent"), agent.id);
    createdAgentIds.push(agent.id);
  }
  for (const a of parsed.agents) {
    if (!a.reportsTo) continue;
    const childId = slugToId.get(a.slug || coreSlugify(a.name, 40, "agent"));
    const managerId = slugToId.get(a.reportsTo);
    if (childId && managerId) {
      await prisma.agent.update({ where: { id: childId }, data: { reportsToAgentId: managerId } });
    } else {
      parsed.warnings.push(
        `could not wire ${a.slug} → reportsTo ${a.reportsTo} (manager not in package)`,
      );
    }
  }

  return { companyId: company.id, slug, createdAgentIds, warnings: parsed.warnings };
}
