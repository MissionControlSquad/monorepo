/**
 * Teams catalog service (Epic #10). A Team is an installable bundle of agent roles. Installing
 * creates one Agent per member in the caller's workspace, applying a collision strategy on name
 * clashes, and records a TeamInstall with the affected agent ids.
 */
import { randomUUID } from "node:crypto";
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type {
  Team,
  TeamMember,
  TeamKind,
  TeamTrustLevel,
  CollisionStrategy,
} from "@agentcenter/database";
import { slugify } from "./skills";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}
function notFound(what: string): never {
  throw new GraphQLError(`${what} not found`, { extensions: { code: "NOT_FOUND" } });
}

export type CollisionAction = "create" | "skip" | "replace";

/** Pure: resolve a member-name collision against existing names. Unit-testable. */
export function resolveCollision(
  existing: string[],
  name: string,
  strategy: CollisionStrategy,
): { action: CollisionAction; name: string } {
  const set = new Set(existing);
  if (!set.has(name)) return { action: "create", name };
  if (strategy === "skip") return { action: "skip", name };
  if (strategy === "replace") return { action: "replace", name };
  // rename → find the first free "<name>-N".
  let n = 2;
  let candidate = `${name}-${n}`;
  while (set.has(candidate)) candidate = `${name}-${++n}`;
  return { action: "create", name: candidate };
}

export async function createTeam(input: {
  workspaceId: string;
  key?: string | null;
  name: string;
  description?: string | null;
  kind?: TeamKind | null;
  trustLevel?: TeamTrustLevel | null;
  createdByProfileId?: string | null;
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

  const createdAgentIds: string[] = [];
  const actions: InstallTeamResult["actions"] = [];

  for (const member of team.members) {
    const res = resolveCollision(names, member.name, args.collisionStrategy);
    if (res.action === "skip") {
      actions.push({ member: member.name, action: "skip", agentName: member.name });
      continue;
    }
    if (res.action === "replace") {
      const target = existingAgents.find((a) => a.name === member.name);
      if (target) {
        await prisma.agent.update({ where: { id: target.id }, data: { role: member.role } });
        createdAgentIds.push(target.id);
        actions.push({ member: member.name, action: "replace", agentName: member.name });
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
      },
    });
    createdAgentIds.push(agent.id);
    names.push(res.name); // avoid intra-install collisions
    actions.push({ member: member.name, action: "create", agentName: res.name });
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
