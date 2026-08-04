import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { SkillComment } from "@agentcenter/database";

// Skill comments (parity #F12). Threaded discussion on a skill. A reply references parentCommentId;
// deletion is soft (keeps thread structure, body tombstoned). Workspace-scoped; author is an agent or a
// human profile.

const MAX_BODY = 8_000;

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

export async function addSkillComment(input: {
  workspaceId: string;
  skillId: string;
  body: string;
  parentCommentId?: string | null;
  authorAgentId?: string | null;
  authorProfileId?: string | null;
}): Promise<SkillComment> {
  if (!input.skillId?.trim()) badRequest("skillId is required");
  if (!input.body?.trim()) badRequest("comment body is required");
  if (input.parentCommentId) {
    const parent = await prisma.skillComment.findFirst({
      where: { id: input.parentCommentId, workspaceId: input.workspaceId, skillId: input.skillId },
      select: { id: true },
    });
    if (!parent) badRequest("parent comment not found on this skill");
  }
  return prisma.skillComment.create({
    data: {
      workspaceId: input.workspaceId,
      skillId: input.skillId,
      body: input.body.slice(0, MAX_BODY),
      parentCommentId: input.parentCommentId ?? null,
      authorAgentId: input.authorAgentId ?? null,
      authorProfileId: input.authorProfileId ?? null,
    },
  });
}

/** All comments on a skill (including soft-deleted tombstones, so replies keep their anchor), oldest first. */
export function listSkillComments(workspaceId: string, skillId: string): Promise<SkillComment[]> {
  return prisma.skillComment.findMany({
    where: { workspaceId, skillId },
    orderBy: { createdAt: "asc" },
  });
}

/** Soft-delete a comment (tombstones the body, preserves the thread). Returns false if not found. */
export async function deleteSkillComment(workspaceId: string, id: string): Promise<boolean> {
  const { count } = await prisma.skillComment.updateMany({
    where: { id, workspaceId, deletedAt: null },
    data: { deletedAt: new Date(), body: "[deleted]" },
  });
  return count > 0;
}
