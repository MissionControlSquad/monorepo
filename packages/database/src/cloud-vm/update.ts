/**
 * @agentcenter/database - CloudVM Operations
 *
 * Update operations for CloudVMs.
 */

import { prisma } from "../client";
import type { CloudVM } from "@prisma/client";
import { CloudVmStatus } from "@agentcenter/utils";

/**
 * Atomically begin destroying a VM: transition to DESTROYING only if it is not already destroying or
 * destroyed. Returns true if THIS caller won. Prevents two concurrent destroy calls from both
 * tearing down live connections and deleting the same (billable) Hetzner server.
 */
export async function tryBeginCloudVMDestroy(id: string): Promise<boolean> {
  const res = await prisma.cloudVM.updateMany({
    where: { id, status: { notIn: [CloudVmStatus.DESTROYING, CloudVmStatus.DESTROYED] } },
    data: { status: CloudVmStatus.DESTROYING },
  });
  return res.count > 0;
}

export async function updateCloudVM(id: string, data: Partial<CloudVM>) {
  return prisma.cloudVM.update({
    where: { id },
    data: data as any,
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
  // Revoke any live gateway install token and delete connection records before
  // marking the VM as errored. This function is called by the deployment-monitor
  // cron (which bypasses the service-layer failVM function), so it must perform
  // the same live-gateway cleanup that failVM does.
  const vm = await prisma.cloudVM.findUnique({
    where: { id },
    select: { serverName: true } as any,
  }) as { serverName: string | null; liveGatewayTokenId?: string | null } | null;

  if (vm?.liveGatewayTokenId) {
    await prisma.liveGatewayToken
      .update({
        where: { id: vm.liveGatewayTokenId },
        data: { isActive: false, revokedAt: now },
      })
      .catch(() => undefined);
  }

  if (vm?.serverName) {
    await prisma.liveGatewayConnection
      .deleteMany({ where: { machineName: vm.serverName } })
      .catch(() => undefined);
  }

  await prisma.cloudVM.update({
    where: { id },
    data: {
      status: CloudVmStatus.ERROR,
      errorMessage,
      errorAt: now,
      setupStep: null,
      liveGatewayTokenId: null,
    } as any,
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
  // Defensively revoke any token that is still active on this VM before the
  // retry begins. Normally failVM already revokes it, but if markCloudVMError
  // was the caller (e.g. deployment-monitor timeout), we handle it here too.
  // This prevents two active install tokens existing simultaneously during retry.
  const vm = await prisma.cloudVM.findUnique({
    where: { id },
    select: {} as any,
  }) as { liveGatewayTokenId?: string | null } | null;

  if (vm?.liveGatewayTokenId) {
    await prisma.liveGatewayToken
      .update({
        where: { id: vm.liveGatewayTokenId },
        data: { isActive: false, revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  await prisma.cloudVM.update({
    where: { id },
    data: {
      status: CloudVmStatus.PROVISIONING,
      errorMessage: null,
      errorAt: null,
      setupStep: "retrying",
      setupProgress: 5,
      liveGatewayTokenId: null, // Fresh token will be created during re-provisioning
    } as any,
  });
}
