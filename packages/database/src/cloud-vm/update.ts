/**
 * @agentcenter/database - CloudVM Operations
 *
 * Update operations for CloudVMs.
 */

import { prisma } from "../client";
import type { CloudVM } from "@prisma/client";

export async function updateCloudVM(id: string, data: Partial<CloudVM>) {
  return prisma.cloudVM.update({
    where: { id },
    data,
    include: {
      agents: { select: { id: true, name: true, username: true, identityEmoji: true, status: true, llmModel: true } },
    },
  });
}

export async function markCloudVMError(
  id: string,
  errorMessage: string,
  now: Date = new Date(),
): Promise<void> {
  await prisma.cloudVM.update({
    where: { id },
    data: { status: "error", errorMessage, errorAt: now, setupStep: null },
  });
}

export async function updateCloudVMUptime(
  id: string,
  totalUptimeSeconds: number,
  estimatedCostCents: number,
): Promise<void> {
  await prisma.cloudVM.update({
    where: { id },
    data: { totalUptimeSeconds, estimatedCostCents },
  });
}

export async function retryCloudVMProvisioning(id: string): Promise<void> {
  await prisma.cloudVM.update({
    where: { id },
    data: {
      status: "provisioning",
      errorMessage: null,
      errorAt: null,
      setupStep: "retrying",
      setupProgress: 5,
    },
  });
}
