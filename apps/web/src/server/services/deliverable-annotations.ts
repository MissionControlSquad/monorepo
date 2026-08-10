/**
 * Tier C: review annotations on deliverables. A comment optionally anchored to a quoted snippet of
 * the deliverable content; resolvable like a review thread. Display/review only.
 */
import { prisma } from "@/server/prisma";
import type { DeliverableAnnotation } from "@agentcenter/database";
import { badRequest } from "./service-errors";

export function deliverableAnnotations(deliverableId: string): Promise<DeliverableAnnotation[]> {
  return prisma.deliverableAnnotation.findMany({
    where: { deliverableId },
    orderBy: { createdAt: "asc" },
  });
}

export async function addDeliverableAnnotation(args: {
  deliverableId: string;
  body: string;
  quote?: string | null;
  createdByProfileId?: string | null;
}): Promise<DeliverableAnnotation> {
  const body = args.body.trim();
  if (!body) badRequest("annotation body is required");
  const deliverable = await prisma.deliverable.findUnique({
    where: { id: args.deliverableId },
    select: { id: true },
  });
  if (!deliverable) badRequest("deliverable not found");
  return prisma.deliverableAnnotation.create({
    data: {
      deliverableId: args.deliverableId,
      body,
      quote: args.quote?.trim() || null,
      createdByProfileId: args.createdByProfileId ?? null,
    },
  });
}

/** Toggle/set the resolved flag on an annotation (review thread lifecycle). */
export async function setAnnotationResolved(
  id: string,
  resolved: boolean,
): Promise<DeliverableAnnotation> {
  const existing = await prisma.deliverableAnnotation.findUnique({ where: { id } });
  if (!existing) badRequest("annotation not found");
  return prisma.deliverableAnnotation.update({ where: { id }, data: { resolved } });
}

export async function deleteDeliverableAnnotation(id: string): Promise<boolean> {
  const res = await prisma.deliverableAnnotation.deleteMany({ where: { id } });
  return res.count > 0;
}
