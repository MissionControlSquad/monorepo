/** @agentcenter/database - Live Gateway DB Operations */

import { prisma } from "../client";

// ─── VMInstallToken ───────────────────────────────────────────────────────────

/** Find an active install token by its bcrypt hash match — caller does bcrypt.compare. */
export async function listActiveInstallTokens() {
  return prisma.vMInstallToken.findMany({
    where: { isActive: true, revokedAt: null },
    select: { id: true, tokenHash: true, tokenPrefix: true, name: true },
  });
}

export async function createInstallToken(data: {
  tokenHash: string;
  tokenPrefix: string;
  name?: string;
}) {
  return prisma.vMInstallToken.create({ data });
}

export async function revokeInstallToken(id: string) {
  return prisma.vMInstallToken.update({
    where: { id },
    data: { isActive: false, revokedAt: new Date() },
  });
}

export async function touchInstallToken(id: string) {
  return prisma.vMInstallToken.update({
    where: { id },
    data: { lastUsedAt: new Date() },
  });
}

// ─── UsedNonce ────────────────────────────────────────────────────────────────

/**
 * Atomically insert a nonce. Returns true if inserted (fresh), false if already used.
 * Uses createMany with skipDuplicates=false and catches unique constraint violation.
 */
export async function consumeNonce(nonce: string): Promise<boolean> {
  try {
    await prisma.usedNonce.create({ data: { nonce } });
    return true;
  } catch {
    // Unique constraint violation — nonce already used
    return false;
  }
}

/** Delete nonces older than the given cutoff (called by cleanup cron). */
export async function deleteExpiredNonces(olderThan: Date): Promise<number> {
  const { count } = await prisma.usedNonce.deleteMany({
    where: { usedAt: { lt: olderThan } },
  });
  return count;
}

// ─── CloudVM live-gateway fields ──────────────────────────────────────────────

/** Find a VM by its stable fingerprint (set on first vm.hello). */
export async function findVMByFingerprint(vmFingerprint: string) {
  return prisma.cloudVM.findUnique({
    where: { vmFingerprint },
    select: {
      id: true,
      vmToken: true,
      vmFingerprint: true,
      connectionStatus: true,
      name: true,
    },
  });
}

/** Mark a VM as connected and record metadata. */
export async function markVMConnected(
  vmId: string,
  pluginVersion: string,
  hostMeta: Record<string, unknown>,
) {
  return prisma.cloudVM.update({
    where: { id: vmId },
    data: {
      connectionStatus: "connected",
      connectedAt: new Date(),
      pluginVersion,
      hostMeta: hostMeta as any,
    },
  });
}

/** Mark a VM as disconnected. */
export async function markVMDisconnected(vmId: string) {
  return prisma.cloudVM.update({
    where: { id: vmId },
    data: { connectionStatus: "disconnected", lastDisconnectedAt: new Date() },
  });
}

/** Bind fingerprint + vmToken hash to a new VM record (first hello with install token). */
export async function bindVMFingerprint(
  vmId: string,
  vmFingerprint: string,
  vmTokenHash: string,
) {
  return prisma.cloudVM.update({
    where: { id: vmId },
    data: { vmFingerprint, vmToken: vmTokenHash },
  });
}

// ─── PendingTaskDelivery ──────────────────────────────────────────────────────

/** Queue a task for delivery. Silently ignores duplicate idempotencyKey. */
export async function enqueuePendingTask(data: {
  vmId: string;
  agentSlug: string;
  taskId: string;
  message: string;
  priority: string;
  idempotencyKey: string;
  expiresAt: Date;
}) {
  try {
    return await prisma.pendingTaskDelivery.create({ data });
  } catch {
    // Unique constraint on idempotencyKey — already queued, skip
    return null;
  }
}

/** Drain all pending, non-expired tasks for a VM (for offline→online delivery). */
export async function drainPendingTasks(vmId: string) {
  return prisma.pendingTaskDelivery.findMany({
    where: {
      vmId,
      delivered: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Atomically mark a task as delivered (CAS — only if still undelivered).
 * Returns true if this call won the race, false if already delivered.
 */
export async function markTaskDelivered(deliveryId: string): Promise<boolean> {
  const { count } = await prisma.pendingTaskDelivery.updateMany({
    where: { id: deliveryId, delivered: false },
    data: { delivered: true, deliveredAt: new Date() },
  });
  return count === 1;
}

/** Delete expired deliveries (called by cleanup cron). */
export async function deleteExpiredDeliveries(olderThan: Date): Promise<number> {
  const { count } = await prisma.pendingTaskDelivery.deleteMany({
    where: { expiresAt: { lt: olderThan } },
  });
  return count;
}
