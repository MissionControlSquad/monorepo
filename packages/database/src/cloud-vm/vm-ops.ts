/** @agentcenter/database - Cloud VM Extended Operations
 * Additional VM and agent DB operations needed by cloud-vm.ts service.
 */

import { prisma } from "../client";

// ─── VM queries ──────────────────────────────────────────────────────

/** Get a cloud VM or throw (bare record, no relations). */
export async function getCloudVMOrThrow(id: string) {
  return prisma.cloudVM.findUniqueOrThrow({ where: { id } });
}

/** Count VMs not in destroyed/error states (for limit check). */
export async function countActiveCloudVMs(): Promise<number> {
  return prisma.cloudVM.count({
    where: { status: { notIn: ["destroyed", "error"] } },
  });
}

/** Create a new cloud VM record. */
export async function createCloudVM(data: Record<string, unknown>) {
  return prisma.cloudVM.create({ data: data as any });
}

/** Find a VM with only SSH fields (for connection checks). */
export async function findCloudVMForSSH(id: string) {
  return prisma.cloudVM.findUnique({
    where: { id },
    select: { ipv4: true, sshPrivateKey: true },
  });
}

// ─── Agent queries on VMs ─────────────────────────────────────────────

/** Get an agent or throw. */
export async function getAgentOrThrow(id: string) {
  return prisma.agent.findUniqueOrThrow({ where: { id } });
}

/** Find agents assigned to a cloud VM with selected fields. */
export async function findAgentsByCloudVmId(
  cloudVmId: string,
  select?: Record<string, boolean>,
) {
  return prisma.agent.findMany({
    where: { cloudVmId },
    ...(select ? { select } : {}),
  });
}

/** Update many agents that belong to a VM. */
export async function updateManyAgentsByVm(
  cloudVmId: string,
  data: Record<string, unknown>,
) {
  return prisma.agent.updateMany({
    where: { cloudVmId },
    data: data as any,
  });
}

/** Find the first agent by VM id matching a slug (username or name). */
export async function findAgentByVmAndSlug(vmId: string, agentSlug: string) {
  return prisma.agent.findFirst({
    where: {
      cloudVmId: vmId,
      OR: [{ username: agentSlug }, { name: agentSlug }],
    },
  });
}

/** List running VMs that have both ipv4 and sshPrivateKey (for repair/maintenance). */
export async function listRunningCloudVMsForRepair() {
  return prisma.cloudVM.findMany({
    where: { status: "running", ipv4: { not: null }, sshPrivateKey: { not: null } },
  });
}
