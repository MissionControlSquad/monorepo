/**
 * Human review comments on project docs (Paperclip parity: document-annotations, simplified to the
 * DeliverableAnnotation shape). A comment optionally anchored to a quoted snippet; resolvable.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { ProjectDocComment } from "@agentcenter/database";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

export function projectDocComments(docId: string): Promise<ProjectDocComment[]> {
  return prisma.projectDocComment.findMany({ where: { docId }, orderBy: { createdAt: "asc" } });
}

export async function addProjectDocComment(args: {
  docId: string;
  body: string;
  quote?: string | null;
  authorProfileId?: string | null;
}): Promise<ProjectDocComment> {
  const body = args.body.trim();
  if (!body) badRequest("comment body is required");
  const doc = await prisma.projectDoc.findUnique({
    where: { id: args.docId },
    select: { id: true },
  });
  if (!doc) badRequest("document not found");
  return prisma.projectDocComment.create({
    data: {
      docId: args.docId,
      body,
      quote: args.quote?.trim() || null,
      authorProfileId: args.authorProfileId ?? null,
    },
  });
}

export async function setProjectDocCommentResolved(
  id: string,
  resolved: boolean,
): Promise<ProjectDocComment> {
  const existing = await prisma.projectDocComment.findUnique({ where: { id } });
  if (!existing) badRequest("comment not found");
  return prisma.projectDocComment.update({ where: { id }, data: { resolved } });
}

export async function deleteProjectDocComment(id: string): Promise<boolean> {
  const res = await prisma.projectDocComment.deleteMany({ where: { id } });
  return res.count > 0;
}
