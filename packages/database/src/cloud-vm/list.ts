/**
 * @agentcenter/database - CloudVM Operations
 *
 * List CloudVMs:
 * - listCloudVMs: all non-destroyed VMs with agent summary
 * - listRunningCloudVMs: only running VMs (for uptime tracking)
 */

import { prisma } from "../client";
import { CloudVmStatus } from "@agentcenter/utils";

export async function listCloudVMs() {
  return prisma.cloudVM.findMany({
    where: { status: { notIn: [CloudVmStatus.DESTROYED] } },
    include: {
      agents: {
        select: { id: true, name: true, identityEmoji: true, username: true, status: true },
      },
      _count: { select: { agents: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listRunningCloudVMs() {
  return prisma.cloudVM.findMany({ where: { status: CloudVmStatus.RUNNING } });
}

export async function listRunningCloudVMsWithAgents() {
  return prisma.cloudVM.findMany({
    where: { status: { notIn: [CloudVmStatus.DESTROYED] } },
    select: {
      id: true,
      name: true,
      status: true,
      region: true,
      serverType: true,
      ipv4: true,
      agents: {
        select: { id: true, name: true, identityEmoji: true, username: true, role: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
