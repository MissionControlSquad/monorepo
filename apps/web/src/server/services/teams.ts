/**
 * Teams catalog service (Epic #10). A Team is an installable bundle of agent roles. Installing
 * creates one Agent per member in the caller's workspace, applying a collision strategy on name
 * clashes, and records a TeamInstall with the affected agent ids.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/prisma";
import type { Team, TeamMember, TeamKind, TeamTrustLevel } from "@agentcenter/database";
import { slugify } from "./skills";
import { provisionSetupStatus } from "./agent-governance";
import { resolveCollision, planCollisions, COLLISION_ACTION } from "@agentcenter/utils";
import type { CollisionAction, CollisionStrategy, CollisionPlanItem } from "@agentcenter/utils";
import { badRequest, notFound } from "./service-errors";

// resolveCollision is a shared pure helper in @agentcenter/utils (reused by skills, teams,
// portability). Imported for internal use here and re-exported for existing importers.
export { resolveCollision };
export type { CollisionAction, CollisionStrategy };

export async function createTeam(input: {
  workspaceId: string;
  key?: string | null;
  name: string;
  description?: string | null;
  kind?: TeamKind | null;
  trustLevel?: TeamTrustLevel | null;
  createdByProfileId?: string | null;
  icon?: string | null;
  tagline?: string | null;
  author?: string | null;
  tags?: string[] | null;
}): Promise<Team> {
  const name = input.name.trim();
  if (!name) badRequest("name is required");
  const key = (input.key?.trim() || slugify(name)).toLowerCase();
  const dup = await prisma.team.findFirst({ where: { workspaceId: input.workspaceId, key } });
  if (dup) badRequest(`a team with key "${key}" already exists`);
  return prisma.team.create({
    data: {
      workspaceId: input.workspaceId,
      key,
      name,
      description: input.description ?? null,
      kind: input.kind ?? "optional",
      trustLevel: input.trustLevel ?? "markdown_only",
      createdByProfileId: input.createdByProfileId ?? null,
      icon: input.icon ?? null,
      tagline: input.tagline ?? null,
      author: input.author ?? null,
      tags: input.tags ?? [],
    },
  });
}

export async function addTeamMember(
  workspaceId: string,
  teamId: string,
  input: {
    name: string;
    role: string;
    templateId?: string | null;
    skills?: string[] | null;
    order?: number | null;
  },
): Promise<TeamMember> {
  const team = await prisma.team.findFirst({ where: { id: teamId, workspaceId } });
  if (!team) notFound("Team");
  return prisma.teamMember.create({
    data: {
      workspaceId,
      teamId,
      name: input.name.trim(),
      role: input.role.trim(),
      templateId: input.templateId ?? null,
      skills: input.skills ?? [],
      order: input.order ?? 0,
    },
  });
}

export interface InstallTeamResult {
  installId: string;
  createdAgentIds: string[];
  actions: { member: string; action: CollisionAction; agentName: string }[];
}

export interface TeamInstallPlanItem {
  member: string;
  action: CollisionAction;
  agentName: string;
}

/**
 * Dry-run: what would installing this team do? Returns the per-member plan (create/rename/skip/
 * replace) without touching the DB. Backs the install-wizard preview.
 */
export async function previewTeamInstall(args: {
  workspaceId: string;
  teamId: string;
  collisionStrategy: CollisionStrategy;
}): Promise<TeamInstallPlanItem[]> {
  const team = await prisma.team.findFirst({
    where: { id: args.teamId, workspaceId: args.workspaceId },
    include: { members: { orderBy: { order: "asc" } } },
  });
  if (!team) notFound("Team");
  const existingNames = (
    await prisma.agent.findMany({
      where: { workspaceId: args.workspaceId },
      select: { name: true },
    })
  ).map((a) => a.name);
  const plan = planCollisions(
    existingNames,
    team.members.map((m) => m.name),
    args.collisionStrategy,
  );
  return plan.map((p: CollisionPlanItem) => ({
    member: p.name,
    action: p.action,
    agentName: p.resolvedName,
  }));
}

/** Install a team: create/replace one Agent per member per the collision strategy; record it. */
export async function installTeam(args: {
  workspaceId: string;
  teamId: string;
  collisionStrategy: CollisionStrategy;
  installedByProfileId?: string | null;
}): Promise<InstallTeamResult> {
  const team = await prisma.team.findFirst({
    where: { id: args.teamId, workspaceId: args.workspaceId },
    include: { members: { orderBy: { order: "asc" } } },
  });
  if (!team) notFound("Team");
  if (team.members.length === 0) badRequest("team has no members to install");

  const existingAgents = await prisma.agent.findMany({
    where: { workspaceId: args.workspaceId },
    select: { id: true, name: true },
  });
  const names = existingAgents.map((a) => a.name);
  // Governance: when the workspace requires agent approval, provisioned agents start pending_setup
  // (blocked from work by the assignment-guard) until an admin activates them.
  const setupStatus = await provisionSetupStatus(args.workspaceId);

  const createdAgentIds: string[] = [];
  const actions: InstallTeamResult["actions"] = [];

  for (const member of team.members) {
    const res = resolveCollision(names, member.name, args.collisionStrategy);
    if (res.action === COLLISION_ACTION.SKIP) {
      actions.push({ member: member.name, action: res.action, agentName: member.name });
      continue;
    }
    if (res.action === COLLISION_ACTION.REPLACE) {
      const target = existingAgents.find((a) => a.name === member.name);
      if (target) {
        await prisma.agent.update({ where: { id: target.id }, data: { role: member.role } });
        createdAgentIds.push(target.id);
        actions.push({ member: member.name, action: res.action, agentName: member.name });
      }
      continue;
    }
    // create (possibly renamed)
    const agent = await prisma.agent.create({
      data: {
        name: res.name,
        role: member.role,
        workspaceId: args.workspaceId,
        username: `${slugify(res.name)}-${randomUUID().slice(0, 6)}`,
        setupStatus,
      },
    });
    createdAgentIds.push(agent.id);
    names.push(res.name); // avoid intra-install collisions
    actions.push({ member: member.name, action: res.action, agentName: res.name });
  }

  const install = await prisma.$transaction(async (tx) => {
    const rec = await tx.teamInstall.create({
      data: {
        workspaceId: args.workspaceId,
        teamId: args.teamId,
        collisionStrategy: args.collisionStrategy,
        createdAgentIds,
        installedByProfileId: args.installedByProfileId ?? null,
      },
    });
    await tx.team.update({ where: { id: args.teamId }, data: { installCount: { increment: 1 } } });
    return rec;
  });

  return { installId: install.id, createdAgentIds, actions };
}
