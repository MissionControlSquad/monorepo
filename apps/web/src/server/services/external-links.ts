/**
 * Tier C: external object links. Attach a task to an external system (GitHub/GitLab/URL). Storage +
 * display only — no live sync. The link kind is auto-classified from the URL host.
 */
import { prisma } from "@/server/prisma";
import type { ExternalLink } from "@agentcenter/database";
import { parseHttpUrl, classifyExternalLink } from "@agentcenter/utils";
import { badRequest } from "./service-errors";

export function taskExternalLinks(taskId: string): Promise<ExternalLink[]> {
  return prisma.externalLink.findMany({ where: { taskId }, orderBy: { createdAt: "asc" } });
}

export async function addExternalLink(args: {
  taskId: string;
  url: string;
  title?: string | null;
  createdByProfileId?: string | null;
}): Promise<ExternalLink> {
  const parsed = parseHttpUrl(args.url);
  if (!parsed) badRequest("a valid http(s) URL is required");
  const task = await prisma.task.findUnique({ where: { id: args.taskId }, select: { id: true } });
  if (!task) badRequest("task not found");
  return prisma.externalLink.create({
    data: {
      taskId: args.taskId,
      url: parsed.toString(),
      kind: classifyExternalLink(args.url),
      title: args.title?.trim() || null,
      createdByProfileId: args.createdByProfileId ?? null,
    },
  });
}

export async function removeExternalLink(id: string): Promise<boolean> {
  const res = await prisma.externalLink.deleteMany({ where: { id } });
  return res.count > 0;
}
