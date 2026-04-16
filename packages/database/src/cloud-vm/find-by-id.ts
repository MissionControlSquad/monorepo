/**
 * @agentcenter/database - CloudVM Operations
 *
 * Find a CloudVM by ID with optional agent includes.
 */

import { prisma } from "../client";

export async function findCloudVMById(id: string) {
  return prisma.cloudVM.findUnique({
    where: { id },
    include: {
      agents: { select: { id: true, name: true, username: true, identityEmoji: true, status: true, llmModel: true } },
    },
  });
}

/** Lightweight lookup — only fields needed for SSH/API connections. */
export async function findCloudVMConnection(id: string) {
  return prisma.cloudVM.findUnique({
    where: { id },
    select: { ipv4: true, sshPrivateKey: true, status: true },
  });
}

/** Bare lookup — only the VM record, no relations. */
export async function findCloudVMRaw(id: string) {
  return prisma.cloudVM.findUnique({ where: { id } });
}

/** Look up a CloudVM ID by its server hostname (serverName field). Returns null if not a managed CloudVM. */
export async function findCloudVMIdByServerName(serverName: string): Promise<string | null> {
  const vm = await prisma.cloudVM.findFirst({
    where: { serverName },
    select: { id: true },
  });
  return vm?.id ?? null;
}
