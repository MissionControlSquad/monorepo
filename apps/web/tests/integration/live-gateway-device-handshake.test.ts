import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { EventEmitter } from "node:events";
import { randomBytes, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../src/server/prisma";
import { handlePluginConnection } from "../../src/server/services/live-gateway-handler";
import { approveDevice } from "../../src/server/services/live-gateway-devices";
import { DEFAULT_WORKSPACE_ID } from "../../src/server/tenancy";

// End-to-end approve flow (GAP-1): a machine pairs by signing the handshake nonce with its Ed25519
// device key. A first-contact device is auto-registered as pending and its connection is rejected
// until an admin approves it; once approved the signed handshake is accepted and a connection is
// created. Exercises the real live-gateway-handler wiring against the DB.

const FP = "handshake-test-fp";
const RAW_INSTALL_TOKEN = randomBytes(32).toString("hex");

// A fake ws that records sent frames and captures terminate/close, mimicking the `ws` WebSocket API
// surface the handler uses (on/send/terminate/readyState).
class FakeWs extends EventEmitter {
  readyState = 1; // OPEN
  sent: any[] = [];
  terminated = false;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  terminate() {
    this.terminated = true;
    this.readyState = 3;
    this.emit("close");
  }
}

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const publicKeyRaw = spki.subarray(spki.length - 32).toString("base64");
  const signB64 = (msg: string) =>
    cryptoSign(null, Buffer.from(msg), privateKey).toString("base64");
  return { publicKeyRaw, signB64 };
}

/** Drive a full vm.hello through the handler and wait for the socket to be written to or closed. */
async function driveHello(ws: FakeWs, frame: Record<string, unknown>): Promise<void> {
  handlePluginConnection(ws as any, {} as any);
  ws.emit("message", Buffer.from(JSON.stringify(frame)));
  // Let the async handler settle (nonce consume, device verify, connection create).
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && ws.sent.length === 0 && !ws.terminated) {
    await new Promise((r) => setTimeout(r, 20));
  }
}

function helloFrame(nonce: string, extra: Record<string, unknown> = {}) {
  return {
    type: "vm.hello",
    token: RAW_INSTALL_TOKEN,
    fingerprint: FP,
    nonce,
    timestamp: Date.now(),
    pluginVersion: "0.0.0-test",
    meta: { hostname: "handshake-host", platform: "linux", arch: "x64" },
    agents: [],
    ...extra,
  };
}

beforeEach(async () => {
  await prisma.liveAgentRoute.deleteMany({ where: { connection: { machineFingerprint: FP } } });
  await prisma.liveGatewayConnection.deleteMany({ where: { machineFingerprint: FP } });
  await prisma.liveGatewayDevice.deleteMany({ where: { machineFingerprint: FP } });
  await prisma.liveGatewayToken.deleteMany({ where: { name: "handshake-test" } });
  await prisma.liveGatewayToken.create({
    data: {
      tokenHash: await bcrypt.hash(RAW_INSTALL_TOKEN, 12),
      tokenPrefix: RAW_INSTALL_TOKEN.slice(0, 8),
      name: "handshake-test",
      isActive: true,
    },
  });
});

afterAll(async () => {
  await prisma.liveAgentRoute.deleteMany({ where: { connection: { machineFingerprint: FP } } });
  await prisma.liveGatewayConnection.deleteMany({ where: { machineFingerprint: FP } });
  await prisma.liveGatewayDevice.deleteMany({ where: { machineFingerprint: FP } });
  await prisma.liveGatewayToken.deleteMany({ where: { name: "handshake-test" } });
});

describe("Live Gateway device handshake (GAP-1 approve flow)", () => {
  it("rejects a first-contact signed device, auto-registers it pending, then accepts it once approved", async () => {
    const { publicKeyRaw, signB64 } = keypair();

    // 1. First contact with a device signature: unknown fingerprint -> auto-register pending + reject.
    const nonce1 = randomBytes(16).toString("hex");
    const ws1 = new FakeWs();
    await driveHello(
      ws1,
      helloFrame(nonce1, { publicKey: publicKeyRaw, signature: signB64(nonce1) }),
    );

    expect(ws1.terminated).toBe(true);
    const authErr = ws1.sent.find((m) => m.type === "mc.error");
    expect(authErr?.code).toBe("auth_failed");
    // No connection created for an unapproved device.
    expect(
      await prisma.liveGatewayConnection.findUnique({ where: { machineFingerprint: FP } }),
    ).toBeNull();
    // Device pinned as pending in the default workspace.
    const pending = await prisma.liveGatewayDevice.findUnique({
      where: { machineFingerprint: FP },
    });
    expect(pending?.status).toBe("pending");
    expect(pending?.publicKeyRaw).toBe(publicKeyRaw);
    expect(pending?.workspaceId).toBe(DEFAULT_WORKSPACE_ID);

    // 2. Admin approves the device.
    await approveDevice(DEFAULT_WORKSPACE_ID, pending!.id, "admin-profile");

    // 3. Reconnect with a fresh signed nonce -> accepted, welcome issued, connection created.
    const nonce2 = randomBytes(16).toString("hex");
    const ws2 = new FakeWs();
    await driveHello(
      ws2,
      helloFrame(nonce2, { publicKey: publicKeyRaw, signature: signB64(nonce2) }),
    );

    expect(ws2.terminated).toBe(false);
    const welcome = ws2.sent.find((m) => m.type === "mc.welcome");
    expect(welcome).toBeDefined();
    expect(welcome.vmToken).toBeTruthy();
    const conn = await prisma.liveGatewayConnection.findUnique({
      where: { machineFingerprint: FP },
    });
    expect(conn).not.toBeNull();
    // lastSeenAt is stamped by verifyDeviceAuth on the approved device.
    const seen = await prisma.liveGatewayDevice.findUnique({ where: { machineFingerprint: FP } });
    expect(seen?.lastSeenAt).toBeTruthy();
  });

  it("rejects a device that presents a public key but no signature", async () => {
    const { publicKeyRaw } = keypair();
    const nonce = randomBytes(16).toString("hex");
    const ws = new FakeWs();
    await driveHello(ws, helloFrame(nonce, { publicKey: publicKeyRaw }));

    expect(ws.terminated).toBe(true);
    expect(ws.sent.find((m) => m.type === "mc.error")?.code).toBe("auth_failed");
    expect(
      await prisma.liveGatewayConnection.findUnique({ where: { machineFingerprint: FP } }),
    ).toBeNull();
  });

  it("rejects a device presenting a valid key but a bad signature", async () => {
    const { publicKeyRaw, signB64 } = keypair();
    // Register + approve the device up front so only the signature check can fail.
    const dev = await prisma.liveGatewayDevice.create({
      data: {
        workspaceId: DEFAULT_WORKSPACE_ID,
        machineFingerprint: FP,
        publicKeyRaw,
        status: "approved",
      },
    });
    expect(dev.status).toBe("approved");

    const nonce = randomBytes(16).toString("hex");
    const ws = new FakeWs();
    await driveHello(
      ws,
      helloFrame(nonce, { publicKey: publicKeyRaw, signature: signB64("not-the-nonce") }),
    );

    expect(ws.terminated).toBe(true);
    expect(ws.sent.find((m) => m.type === "mc.error")?.code).toBe("auth_failed");
    expect(
      await prisma.liveGatewayConnection.findUnique({ where: { machineFingerprint: FP } }),
    ).toBeNull();
  });

  it("keeps the legacy bcrypt-token path working when no device key is presented", async () => {
    const nonce = randomBytes(16).toString("hex");
    const ws = new FakeWs();
    await driveHello(ws, helloFrame(nonce)); // no publicKey/signature

    expect(ws.terminated).toBe(false);
    expect(ws.sent.find((m) => m.type === "mc.welcome")).toBeDefined();
    expect(
      await prisma.liveGatewayConnection.findUnique({ where: { machineFingerprint: FP } }),
    ).not.toBeNull();
    // No device row is created on the legacy path.
    expect(
      await prisma.liveGatewayDevice.findUnique({ where: { machineFingerprint: FP } }),
    ).toBeNull();
  });
});
