/**
 * Workspace export / import (Epic #14). Export serializes a workspace's agents/projects/skills into
 * a versioned, credential-free JSON bundle; import re-creates them in the caller's workspace with a
 * collision strategy. Only the import audit (WorkspaceImport) is persisted.
 *
 * SECURITY: a bundle is portable CONFIG, never credentials — export whitelists safe fields only
 * (never apiKeyHash, secrets, tokens, budgets, or buildbase identity).
 */
import { randomUUID } from "node:crypto";
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { CollisionStrategy } from "@agentcenter/database";
import { resolveCollision } from "./teams";
import { createSkill, slugify } from "./skills";

export const BUNDLE_VERSION = 1;

export interface PortableAgent {
  name: string;
  role: string;
  personality?: string | null;
  avatar?: string | null;
  identityEmoji?: string | null;
  level?: string | null;
  llmModel?: string | null;
}
export interface PortableProject {
  name: string;
  description?: string | null;
  status?: string | null;
}
export interface PortableSkill {
  key: string;
  name: string;
  markdown: string;
  description?: string | null;
  categories?: string[];
  trustLevel?: string | null;
}
export interface PortableBundle {
  version: number;
  exportedAt: string;
  agents: PortableAgent[];
  projects: PortableProject[];
  skills: PortableSkill[];
}

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/** Pure: validate a bundle's shape + version. Throws BAD_USER_INPUT on a malformed bundle. */
export function validateBundle(input: unknown): PortableBundle {
  if (!input || typeof input !== "object") badRequest("bundle must be an object");
  const b = input as Record<string, unknown>;
  if (b.version !== BUNDLE_VERSION)
    badRequest(`unsupported bundle version (expected ${BUNDLE_VERSION})`);
  for (const key of ["agents", "projects", "skills"] as const) {
    if (!Array.isArray(b[key])) badRequest(`bundle.${key} must be an array`);
  }
  return b as unknown as PortableBundle;
}

/** Export the caller's workspace as a credential-free portable bundle. */
export async function exportWorkspaceBundle(workspaceId: string): Promise<PortableBundle> {
  const [agents, projects, skills] = await Promise.all([
    prisma.agent.findMany({
      where: { workspaceId },
      select: {
        name: true,
        role: true,
        personality: true,
        avatar: true,
        identityEmoji: true,
        level: true,
        llmModel: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { workspaceId },
      select: { name: true, description: true, status: true },
      orderBy: { name: "asc" },
    }),
    prisma.skill.findMany({
      where: { workspaceId },
      select: {
        key: true,
        name: true,
        markdown: true,
        description: true,
        categories: true,
        trustLevel: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    agents: agents.map((a) => ({ ...a, level: a.level ?? null })),
    projects,
    skills,
  };
}

export interface ImportSummary {
  createdAgents: number;
  skippedAgents: number;
  createdProjects: number;
  skippedProjects: number;
  createdSkills: number;
  skippedSkills: number;
}

/**
 * Import a bundle into the caller's workspace. Agents apply the collision strategy on name; projects
 * skip a same-named existing; skills skip a same-key existing. Best-effort per entity; records an
 * audit row + returns a summary.
 */
export async function importWorkspaceBundle(args: {
  workspaceId: string;
  bundle: unknown;
  collisionStrategy: CollisionStrategy;
  importedByProfileId?: string | null;
}): Promise<{ importId: string; summary: ImportSummary }> {
  const bundle = validateBundle(args.bundle);
  const summary: ImportSummary = {
    createdAgents: 0,
    skippedAgents: 0,
    createdProjects: 0,
    skippedProjects: 0,
    createdSkills: 0,
    skippedSkills: 0,
  };
  const createdAgentIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdSkillIds: string[] = [];

  // Agents (collision strategy on name).
  const existingAgents = await prisma.agent.findMany({
    where: { workspaceId: args.workspaceId },
    select: { id: true, name: true },
  });
  const agentNames = existingAgents.map((a) => a.name);
  for (const a of bundle.agents) {
    if (!a?.name || !a?.role) continue;
    const res = resolveCollision(agentNames, a.name, args.collisionStrategy);
    if (res.action === "skip") {
      summary.skippedAgents++;
      continue;
    }
    if (res.action === "replace") {
      const target = existingAgents.find((x) => x.name === a.name);
      if (target) {
        await prisma.agent.update({
          where: { id: target.id },
          data: { role: a.role, personality: a.personality ?? null },
        });
        createdAgentIds.push(target.id);
        summary.createdAgents++;
      }
      continue;
    }
    const agent = await prisma.agent.create({
      data: {
        name: res.name,
        role: a.role,
        workspaceId: args.workspaceId,
        personality: a.personality ?? null,
        avatar: a.avatar ?? null,
        identityEmoji: a.identityEmoji ?? null,
        llmModel: a.llmModel ?? null,
        username: `${slugify(res.name)}-${randomUUID().slice(0, 6)}`,
      },
    });
    createdAgentIds.push(agent.id);
    agentNames.push(res.name);
    summary.createdAgents++;
  }

  // Projects (skip same-named).
  for (const p of bundle.projects) {
    if (!p?.name) continue;
    const dup = await prisma.project.findFirst({
      where: { workspaceId: args.workspaceId, name: p.name },
      select: { id: true },
    });
    if (dup) {
      summary.skippedProjects++;
      continue;
    }
    const project = await prisma.project.create({
      data: { name: p.name, description: p.description ?? null, workspaceId: args.workspaceId },
    });
    createdProjectIds.push(project.id);
    summary.createdProjects++;
  }

  // Skills (skip same-key).
  for (const s of bundle.skills) {
    if (!s?.key || !s?.name || !s?.markdown) continue;
    const dup = await prisma.skill.findFirst({
      where: { workspaceId: args.workspaceId, key: s.key.toLowerCase() },
      select: { id: true },
    });
    if (dup) {
      summary.skippedSkills++;
      continue;
    }
    const skill = await createSkill({
      workspaceId: args.workspaceId,
      createdByProfileId: args.importedByProfileId ?? null,
      key: s.key,
      name: s.name,
      markdown: s.markdown,
      description: s.description ?? null,
      categories: s.categories ?? null,
    });
    createdSkillIds.push(skill.id);
    summary.createdSkills++;
  }

  const record = await prisma.workspaceImport.create({
    data: {
      workspaceId: args.workspaceId,
      bundleVersion: bundle.version,
      collisionStrategy: args.collisionStrategy,
      createdAgentIds,
      createdProjectIds,
      createdSkillIds,
      summary: summary as never,
      importedByProfileId: args.importedByProfileId ?? null,
    },
  });
  return { importId: record.id, summary };
}
