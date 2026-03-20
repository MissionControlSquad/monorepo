/**
 * @agentcenter/database - Cloud VM Operations
 *
 * Find VM or throw if not found.
 */

import { prisma } from "../client";

export async function findCloudVMForEnsure(id: string) {
  return prisma.cloudVM.findUniqueOrThrow({
    where: { id },
    select: { ipv4: true, sshPrivateKey: true, status: true },
  });
}
