import { verify as cryptoVerify, createPublicKey } from "node:crypto";
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { LiveGatewayDevice } from "@agentcenter/database";

// Live Gateway device pairing (parity Domain-10 A5/A6 / GAP-1). A runtime machine proves its identity by
// signing a server nonce with its Ed25519 device key; the machine is pinned by fingerprint and must be
// board-approved. verifyDeviceAuth is the pure-crypto + policy check the gateway handler calls after the
// nonce is consumed. Workspace-scoped.

// Fixed DER SPKI prefix for an Ed25519 public key (RFC 8410) — lets us build a KeyObject from a raw
// 32-byte key without external libs.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/** Pure: verify an Ed25519 signature (base64) over `message` using a raw base64 public key. Never throws. */
export function verifyEd25519(
  publicKeyRaw: string,
  message: string,
  signatureB64: string,
): boolean {
  try {
    const raw = Buffer.from(publicKeyRaw, "base64");
    if (raw.length !== 32) return false;
    const keyObject = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
      format: "der",
      type: "spki",
    });
    return cryptoVerify(null, Buffer.from(message), keyObject, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

/** Register a device (first contact). New devices land in `pending` until board-approved. */
export async function registerDevice(input: {
  workspaceId: string;
  machineFingerprint: string;
  publicKeyRaw: string;
  label?: string | null;
}): Promise<LiveGatewayDevice> {
  if (!input.machineFingerprint?.trim()) badRequest("machineFingerprint is required");
  if (Buffer.from(input.publicKeyRaw ?? "", "base64").length !== 32)
    badRequest("publicKeyRaw must be a base64 32-byte Ed25519 key");
  return prisma.liveGatewayDevice.upsert({
    where: { machineFingerprint: input.machineFingerprint },
    create: {
      workspaceId: input.workspaceId,
      machineFingerprint: input.machineFingerprint,
      publicKeyRaw: input.publicKeyRaw,
      label: input.label ?? null,
    },
    // A re-register never silently rotates the key of an approved device (would defeat pinning).
    update: { label: input.label ?? undefined },
  });
}

export async function approveDevice(
  workspaceId: string,
  id: string,
  approvedByProfileId?: string | null,
): Promise<LiveGatewayDevice> {
  const { count } = await prisma.liveGatewayDevice.updateMany({
    where: { id, workspaceId },
    data: {
      status: "approved",
      approvedByProfileId: approvedByProfileId ?? null,
      approvedAt: new Date(),
    },
  });
  if (count === 0) badRequest("Device not found");
  return (await prisma.liveGatewayDevice.findFirst({ where: { id, workspaceId } }))!;
}

export async function revokeDevice(workspaceId: string, id: string): Promise<boolean> {
  const { count } = await prisma.liveGatewayDevice.updateMany({
    where: { id, workspaceId },
    data: { status: "revoked" },
  });
  return count > 0;
}

export function listDevices(workspaceId: string, status?: string): Promise<LiveGatewayDevice[]> {
  return prisma.liveGatewayDevice.findMany({
    where: { workspaceId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

export type DeviceAuthResult =
  | { ok: true; device: LiveGatewayDevice }
  | { ok: false; reason: "unknown_device" | "device_pending" | "device_revoked" | "bad_signature" };

/**
 * Authenticate a device's signed nonce (the gateway handler calls this after consuming the nonce). An
 * unknown fingerprint is rejected as `unknown_device` (the caller may auto-register as pending); a
 * non-approved device is rejected; the signature must verify against the pinned key. On success the
 * device's lastSeenAt is stamped.
 */
export async function verifyDeviceAuth(input: {
  machineFingerprint: string;
  nonce: string;
  signatureB64: string;
}): Promise<DeviceAuthResult> {
  const device = await prisma.liveGatewayDevice.findUnique({
    where: { machineFingerprint: input.machineFingerprint },
  });
  if (!device) return { ok: false, reason: "unknown_device" };
  if (device.status === "revoked") return { ok: false, reason: "device_revoked" };
  if (device.status !== "approved") return { ok: false, reason: "device_pending" };
  if (!verifyEd25519(device.publicKeyRaw, input.nonce, input.signatureB64))
    return { ok: false, reason: "bad_signature" };
  await prisma.liveGatewayDevice.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() },
  });
  return { ok: true, device };
}
