/**
 * @agentcenter/database - CloudVM Operations
 *
 * Append a log entry for a CloudVM.
 */

import { prisma } from "../client";

export async function logCloudVMEvent(
  vmId: string,
  message: string,
  level: "info" | "warn" | "error",
): Promise<void> {
  await prisma.cloudVMLog.create({ data: { vmId, message, level } });
}

export async function getCloudVMLogs(
  vmId: string,
  limit = 50,
): Promise<{ id: string; message: string; level: string; createdAt: Date }[]> {
  return prisma.cloudVMLog.findMany({
    where: { vmId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, message: true, level: true, createdAt: true },
  });
}
