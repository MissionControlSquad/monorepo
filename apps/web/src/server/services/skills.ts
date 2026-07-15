/**
 * Skills library service (Epic #10). Per-workspace reusable capability modules (markdown) with
 * immutable versions, fork lineage, stars, and queryable agent assignment. Counters
 * (currentVersion / starCount / installCount / forkCount) are maintained next to the writes.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import { slugify as coreSlugify } from "@agentcenter/utils";
import type {
  Skill,
  SkillSourceType,
  SkillTrustLevel,
  SkillSharingScope,
} from "@agentcenter/database";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}
function notFound(what: string): never {
  throw new GraphQLError(`${what} not found`, { extensions: { code: "NOT_FOUND" } });
}

/** Skill slug: the shared core slugify, capped at 64 chars with a "skill" fallback. */
export function slugify(name: string): string {
  return coreSlugify(name, 64, "skill");
}

async function loadSkill(workspaceId: string, id: string) {
  const s = await prisma.skill.findFirst({ where: { id, workspaceId } });
  if (!s) notFound("Skill");
  return s;
}

export interface CreateSkillInput {
  workspaceId: string;
  name: string;
  markdown: string;
  key?: string | null;
  description?: string | null;
  categories?: string[] | null;
  sourceType?: SkillSourceType | null;
  trustLevel?: SkillTrustLevel | null;
  sharingScope?: SkillSharingScope | null;
  createdByProfileId?: string | null;
  icon?: string | null;
  color?: string | null;
  tagline?: string | null;
  author?: string | null;
  homepage?: string | null;
}

export async function createSkill(input: CreateSkillInput): Promise<Skill> {
  const name = input.name.trim();
  if (!name) badRequest("name is required");
  if (!input.markdown) badRequest("markdown is required");
  const key = (input.key?.trim() || slugify(name)).toLowerCase();
  const dup = await prisma.skill.findFirst({ where: { workspaceId: input.workspaceId, key } });
  if (dup) badRequest(`a skill with key "${key}" already exists`);

  return prisma.$transaction(async (tx) => {
    const skill = await tx.skill.create({
      data: {
        workspaceId: input.workspaceId,
        key,
        slug: slugify(name),
        name,
        markdown: input.markdown,
        description: input.description ?? null,
        categories: input.categories ?? [],
        icon: input.icon ?? null,
        color: input.color ?? null,
        tagline: input.tagline ?? null,
        author: input.author ?? null,
        homepage: input.homepage ?? null,
        sourceType: input.sourceType ?? "local_path",
        trustLevel: input.trustLevel ?? "markdown_only",
        sharingScope: input.sharingScope ?? "workspace",
        createdByProfileId: input.createdByProfileId ?? null,
        currentVersion: 1,
      },
    });
    await tx.skillVersion.create({
      data: {
        workspaceId: input.workspaceId,
        skillId: skill.id,
        revisionNumber: 1,
        content: input.markdown,
        createdByProfileId: input.createdByProfileId ?? null,
      },
    });
    return skill;
  });
}

export async function updateSkill(
  workspaceId: string,
  id: string,
  patch: {
    name?: string | null;
    description?: string | null;
    markdown?: string | null;
    categories?: string[] | null;
    trustLevel?: SkillTrustLevel | null;
    sharingScope?: SkillSharingScope | null;
    icon?: string | null;
    color?: string | null;
    tagline?: string | null;
    author?: string | null;
    homepage?: string | null;
  },
  actorProfileId?: string | null,
): Promise<Skill> {
  const existing = await loadSkill(workspaceId, id);
  const markdownChanged = patch.markdown != null && patch.markdown !== existing.markdown;
  const nextVersion = markdownChanged ? existing.currentVersion + 1 : existing.currentVersion;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.skill.update({
      where: { id },
      data: {
        ...(patch.name != null ? { name: patch.name.trim(), slug: slugify(patch.name) } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.categories != null ? { categories: patch.categories } : {}),
        ...(patch.trustLevel != null ? { trustLevel: patch.trustLevel } : {}),
        ...(patch.sharingScope != null ? { sharingScope: patch.sharingScope } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.tagline !== undefined ? { tagline: patch.tagline } : {}),
        ...(patch.author !== undefined ? { author: patch.author } : {}),
        ...(patch.homepage !== undefined ? { homepage: patch.homepage } : {}),
        ...(markdownChanged ? { markdown: patch.markdown!, currentVersion: nextVersion } : {}),
      },
    });
    if (markdownChanged) {
      await tx.skillVersion.create({
        data: {
          workspaceId,
          skillId: id,
          revisionNumber: nextVersion,
          content: patch.markdown!,
          createdByProfileId: actorProfileId ?? null,
        },
      });
    }
    return updated;
  });
}

/** Delete a skill (and its versions/stars/assignments via FK cascade). Workspace-scoped. */
export async function deleteSkill(workspaceId: string, id: string): Promise<boolean> {
  await loadSkill(workspaceId, id); // 404s cross-workspace / missing
  await prisma.skill.delete({ where: { id } });
  return true;
}

/** Fork a skill into a new one (copies the current markdown as rev 1), bumping the source forkCount. */
export async function forkSkill(
  workspaceId: string,
  id: string,
  createdByProfileId?: string | null,
): Promise<Skill> {
  const source = await loadSkill(workspaceId, id);
  const baseKey = `${source.key}-fork`;
  let key = baseKey;
  for (let i = 2; await prisma.skill.findFirst({ where: { workspaceId, key } }); i++)
    key = `${baseKey}-${i}`;

  const [fork] = await prisma.$transaction([
    prisma.skill.create({
      data: {
        workspaceId,
        key,
        slug: slugify(source.name),
        name: `${source.name} (fork)`,
        markdown: source.markdown,
        description: source.description,
        categories: source.categories,
        sourceType: source.sourceType,
        trustLevel: source.trustLevel,
        sharingScope: "workspace",
        forkedFromSkillId: source.id,
        createdByProfileId: createdByProfileId ?? null,
        currentVersion: 1,
      },
    }),
    prisma.skill.update({ where: { id: source.id }, data: { forkCount: { increment: 1 } } }),
  ]);
  await prisma.skillVersion.create({
    data: {
      workspaceId,
      skillId: fork.id,
      revisionNumber: 1,
      content: source.markdown,
      createdByProfileId,
    },
  });
  return fork;
}

export async function starSkill(
  workspaceId: string,
  skillId: string,
  profileId: string,
): Promise<number> {
  await loadSkill(workspaceId, skillId);
  const existing = await prisma.skillStar.findFirst({ where: { skillId, profileId } });
  if (existing) return (await prisma.skill.findUniqueOrThrow({ where: { id: skillId } })).starCount;
  const [, skill] = await prisma.$transaction([
    prisma.skillStar.create({ data: { workspaceId, skillId, profileId } }),
    prisma.skill.update({ where: { id: skillId }, data: { starCount: { increment: 1 } } }),
  ]);
  return skill.starCount;
}

export async function unstarSkill(
  workspaceId: string,
  skillId: string,
  profileId: string,
): Promise<number> {
  const res = await prisma.skillStar.deleteMany({ where: { skillId, profileId, workspaceId } });
  if (res.count === 0)
    return (await prisma.skill.findUniqueOrThrow({ where: { id: skillId } })).starCount;
  const skill = await prisma.skill.update({
    where: { id: skillId },
    data: { starCount: { decrement: 1 } },
  });
  return skill.starCount;
}

/** Recompute installCount = distinct agents assigned this skill. */
async function syncInstallCount(skillId: string) {
  const count = await prisma.agentSkill.count({ where: { skillId } });
  await prisma.skill.update({ where: { id: skillId }, data: { installCount: count } });
}

export async function assignSkillToAgent(args: {
  workspaceId: string;
  agentId: string;
  skillId: string;
  pinnedVersion?: number | null;
}) {
  await loadSkill(args.workspaceId, args.skillId);
  const agent = await prisma.agent.findFirst({
    where: { id: args.agentId, workspaceId: args.workspaceId },
    select: { id: true },
  });
  if (!agent) notFound("Agent");
  const dup = await prisma.agentSkill.findFirst({
    where: { agentId: args.agentId, skillId: args.skillId },
  });
  if (dup) badRequest("skill already assigned to this agent");
  const link = await prisma.agentSkill.create({
    data: {
      workspaceId: args.workspaceId,
      agentId: args.agentId,
      skillId: args.skillId,
      pinnedVersion: args.pinnedVersion ?? null,
    },
  });
  await syncInstallCount(args.skillId);
  return link;
}

export async function unassignSkillFromAgent(
  workspaceId: string,
  agentId: string,
  skillId: string,
): Promise<boolean> {
  const res = await prisma.agentSkill.deleteMany({ where: { agentId, skillId, workspaceId } });
  if (res.count === 0) return false;
  await syncInstallCount(skillId);
  return true;
}
