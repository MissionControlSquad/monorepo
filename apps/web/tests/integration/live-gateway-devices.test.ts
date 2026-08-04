import { describe, it, expect, beforeEach } from "vitest";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { prisma } from "../../src/server/prisma";
import {
  registerDevice,
  approveDevice,
  revokeDevice,
  verifyDeviceAuth,
  verifyEd25519,
} from "../../src/server/services/live-gateway-devices";

// Parity Domain-10 A5/A6 / GAP-1 — Ed25519 device pairing for the Live Gateway.
const WS = "ws_lgdevice";

// A real Ed25519 keypair; raw public key = SPKI DER minus the 12-byte prefix.
function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const publicKeyRaw = spki.subarray(spki.length - 32).toString("base64");
  const signB64 = (msg: string) =>
    cryptoSign(null, Buffer.from(msg), privateKey).toString("base64");
  return { publicKeyRaw, signB64 };
}

beforeEach(async () => {
  await prisma.liveGatewayDevice.deleteMany({ where: { workspaceId: WS } });
});

describe("verifyEd25519 (pure crypto)", () => {
  it("verifies a valid signature and rejects a bad one", () => {
    const { publicKeyRaw, signB64 } = keypair();
    const nonce = "a".repeat(32);
    expect(verifyEd25519(publicKeyRaw, nonce, signB64(nonce))).toBe(true);
    expect(verifyEd25519(publicKeyRaw, nonce, signB64("different"))).toBe(false);
    expect(verifyEd25519("not-a-key", nonce, signB64(nonce))).toBe(false);
  });
});

describe("device pairing (GAP-1)", () => {
  it("pending device can't auth until approved; revoked can't after", async () => {
    const { publicKeyRaw, signB64 } = keypair();
    const nonce = "b".repeat(32);
    const fp = "machine-1";
    const dev = await registerDevice({ workspaceId: WS, machineFingerprint: fp, publicKeyRaw });
    expect(dev.status).toBe("pending");

    // pending → rejected
    expect(
      (await verifyDeviceAuth({ machineFingerprint: fp, nonce, signatureB64: signB64(nonce) })).ok,
    ).toBe(false);
    expect(
      (await verifyDeviceAuth({ machineFingerprint: fp, nonce, signatureB64: signB64(nonce) })) as {
        reason: string;
      },
    ).toMatchObject({ reason: "device_pending" });

    await approveDevice(WS, dev.id, "admin");
    const ok = await verifyDeviceAuth({
      machineFingerprint: fp,
      nonce,
      signatureB64: signB64(nonce),
    });
    expect(ok.ok).toBe(true);

    // wrong signature rejected even when approved
    const bad = await verifyDeviceAuth({
      machineFingerprint: fp,
      nonce,
      signatureB64: signB64("evil"),
    });
    expect(bad).toMatchObject({ ok: false, reason: "bad_signature" });

    await revokeDevice(WS, dev.id);
    expect(
      (await verifyDeviceAuth({ machineFingerprint: fp, nonce, signatureB64: signB64(nonce) })) as {
        reason: string;
      },
    ).toMatchObject({
      reason: "device_revoked",
    });
  });

  it("unknown fingerprint is rejected; bad key length is refused at register", async () => {
    expect(
      await verifyDeviceAuth({ machineFingerprint: "nope", nonce: "x", signatureB64: "y" }),
    ).toMatchObject({
      reason: "unknown_device",
    });
    await expect(
      registerDevice({ workspaceId: WS, machineFingerprint: "m", publicKeyRaw: "shorts" }),
    ).rejects.toThrow(/32-byte/);
  });
});
