/**
 * @agentcenter/database — Live Gateway helpers
 *
 * All operations for the additive live communication layer.
 * No dependencies on CloudVM — works for any machine type.
 */

import { prisma } from "../client";

// ── Install tokens ────────────────────────────────────────────────────────────

export async function listActiveLiveGatewayTokens() {
  return prisma.liveGatewayToken.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createLiveGatewayToken(data: {
  tokenHash: string;
  tokenPrefix: string;
  name?: string;
}) {
  return prisma.liveGatewayToken.create({ data });
}

export async function revokeLiveGatewayToken(id: string) {
  await prisma.liveGatewayToken.update({
    where: { id },
    data: { isActive: false, revokedAt: new Date() },
  });
}

export async function touchLiveGatewayToken(id: string) {
  await prisma.liveGatewayToken.update({
    where: { id },
    data: { lastUsedAt: new Date() },
  }).catch(() => undefined);
}

// ── Nonces ────────────────────────────────────────────────────────────────────

/**
 * Atomically consume a nonce. Returns true if nonce was new (allowed),
 * false if already used (replay attempt).
 */
export async function consumeNonce(nonce: string): Promise<boolean> {
  try {
    await prisma.usedNonce.create({ data: { nonce } });
    return true;
  } catch {
    // Unique constraint violation = replay
    return false;
  }
}

export async function deleteExpiredNonces(): Promise<number> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
  const { count } = await prisma.usedNonce.deleteMany({ where: { usedAt: { lt: cutoff } } });
  return count;
}

// ── Connections ───────────────────────────────────────────────────────────────

export async function findConnectionByFingerprint(machineFingerprint: string) {
  return prisma.liveGatewayConnection.findUnique({ where: { machineFingerprint } });
}

export async function createConnection(data: {
  machineFingerprint: string;
  connectionToken?: string;
  machineName?: string;
  pluginVersion?: string;
  hostMeta?: Record<string, unknown>;
}) {
  return prisma.liveGatewayConnection.create({
    data: {
      ...data,
      connectionStatus: "connected",
      connectedAt: new Date(),
    } as any,
  });
}

export async function refreshConnectionToken(id: string, connectionToken: string) {
  await prisma.liveGatewayConnection.update({
    where: { id },
    data: { connectionToken },
  });
}

export async function markConnectionConnected(
  id: string,
  pluginVersion: string,
  hostMeta?: Record<string, unknown>,
) {
  await prisma.liveGatewayConnection.update({
    where: { id },
    data: {
      connectionStatus: "connected",
      connectedAt: new Date(),
      pluginVersion,
      ...(hostMeta ? { hostMeta: hostMeta as any } : {}),
    },
  });
}

export async function markConnectionDisconnected(id: string) {
  await prisma.liveGatewayConnection.update({
    where: { id },
    data: { connectionStatus: "disconnected", lastDisconnectedAt: new Date() },
  });
}

export async function deleteLiveGatewayConnection(id: string) {
  await prisma.liveGatewayConnection.delete({ where: { id } });
}

/**
 * Mark all connections for a machine as disconnected without deleting them.
 * Used when a VM is stopped so the DB reflects the offline state immediately,
 * rather than waiting for the WebSocket close event to propagate.
 * Pending deliveries are preserved — they will be drained when the VM restarts
 * and the plugin reconnects.
 */
export async function markConnectionsDisconnectedByMachineName(machineName: string): Promise<void> {
  await prisma.liveGatewayConnection.updateMany({
    where: { machineName, connectionStatus: "connected" },
    data: { connectionStatus: "disconnected", lastDisconnectedAt: new Date() },
  });
}

/**
 * Delete all gateway connections for a machine identified by its hostname.
 * Cloud VMs use the Hetzner server name as their hostname; calling this on
 * VM destroy ensures the DB connection record (and cascaded routes + deliveries)
 * are cleaned up even if the WS close event never fired.
 */
export async function deleteConnectionsByMachineName(machineName: string): Promise<void> {
  await prisma.liveGatewayConnection.deleteMany({ where: { machineName } });
}

// ── Agent routes ──────────────────────────────────────────────────────────────

/**
 * Sync the full agent slug list for a connection.
 * Deletes routes no longer reported, creates new ones.
 */
export async function syncAgentRoutes(connectionId: string, slugs: string[]) {
  // Remove routes for slugs not in the new list
  await prisma.liveAgentRoute.deleteMany({
    where: { connectionId, agentSlug: { notIn: slugs } },
  });
  // Upsert each slug
  for (const agentSlug of slugs) {
    await prisma.liveAgentRoute.upsert({
      where: { connectionId_agentSlug: { connectionId, agentSlug } },
      create: { connectionId, agentSlug },
      update: {},
    });
  }
}

export async function clearAgentRoutes(connectionId: string) {
  await prisma.liveAgentRoute.deleteMany({ where: { connectionId } });
}

/**
 * Hot path: task delivery looks up connectionId by agent username.
 * Returns the first (most recently created) active connection for this slug.
 */
export async function findConnectionByAgentSlug(agentSlug: string) {
  const route = await prisma.liveAgentRoute.findFirst({
    where: { agentSlug },
    include: { connection: true },
    orderBy: { createdAt: "desc" },
  });
  return route?.connection ?? null;
}

// ── Pending deliveries ────────────────────────────────────────────────────────

export async function enqueuePendingDelivery(data: {
  connectionId: string;
  agentSlug: string;
  taskId: string;
  message: string;
  priority: string;
  idempotencyKey: string;
  expiresAt: Date;
}): Promise<{ id: string } | null> {
  try {
    return await prisma.livePendingDelivery.create({ data });
  } catch {
    // idempotencyKey unique violation = already queued
    return null;
  }
}

/**
 * Drain undelivered tasks for a connection.
 * Returns tasks ordered by createdAt asc (oldest first).
 */
export async function drainPendingDeliveries(connectionId: string) {
  const now = new Date();
  return prisma.livePendingDelivery.findMany({
    where: { connectionId, delivered: false, expiresAt: { gt: now } },
    orderBy: { createdAt: "asc" },
  });
}

export async function markDeliveryReceived(deliveryId: string) {
  await prisma.livePendingDelivery
    .update({
      where: { id: deliveryId },
      data: { delivered: true, deliveredAt: new Date() },
    })
    .catch(() => undefined);
}

export async function deleteExpiredDeliveries(): Promise<number> {
  const { count } = await prisma.livePendingDelivery.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}

/**
 * Find a pending delivery by ID, returning only connectionId for ownership validation.
 * Used by the task ack handler to prevent one connection from acking another's delivery.
 */
export async function findPendingDeliveryConnection(
  deliveryId: string,
): Promise<{ connectionId: string } | null> {
  return prisma.livePendingDelivery
    .findUnique({ where: { id: deliveryId }, select: { connectionId: true } })
    .catch(() => null);
}

// ── Read helpers (for UI) ─────────────────────────────────────────────────────

export async function listLiveGatewayConnections() {
  return prisma.liveGatewayConnection.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      agentRoutes: { select: { agentSlug: true } },
    },
  });
}
