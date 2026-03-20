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
