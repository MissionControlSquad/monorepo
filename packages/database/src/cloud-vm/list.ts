/**
 * @agentcenter/database - CloudVM Operations
 *
 * List CloudVMs:
 * - listCloudVMs: all non-destroyed VMs with agent summary
 * - listRunningCloudVMs: only running VMs (for uptime tracking)
 */

import { prisma } from "../client";

export async function listCloudVMs() {
  return prisma.cloudVM.findMany({
    where: { status: { notIn: ["destroyed"] } },
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
  return prisma.cloudVM.findMany({ where: { status: "running" } });
}

export async function listRunningCloudVMsWithAgents() {
  return prisma.cloudVM.findMany({
    where: { status: "running" },
    select: {
      id: true,
      name: true,
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
