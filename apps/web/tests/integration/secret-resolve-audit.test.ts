import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { prisma } from "../../src/server/prisma";
import { createSecret, resolveWorkspaceSecret } from "../../src/server/services/secrets";

// Regression (Domain 7 A3): every resolveWorkspaceSecret must leave a SecretAccessEvent, not just the
// agent env-injection path — closing the "unaudited resolve" gap for BYO creds / git tokens / plugin config.
const WS = "ws_secretaudit";

beforeAll(() => {
  process.env.SYSTEM_SECRET = "secret-audit-test";
});

beforeEach(async () => {
  await prisma.secret.deleteMany({ where: { workspaceId: WS } });
});

describe("resolveWorkspaceSecret audit-on-resolve (A3)", () => {
  it("records a read access event on every resolve", async () => {
    const secret = await createSecret({
      workspaceId: WS,
      name: "GIT_TOKEN",
      value: "ghp_x",
      createdBy: "u1",
    });

    const before = await prisma.secretAccessEvent.count({
      where: { secretId: secret.id, action: "read" },
    });
    const value = await resolveWorkspaceSecret(WS, "GIT_TOKEN");
    expect(value).toBe("ghp_x");

    const after = await prisma.secretAccessEvent.findMany({
      where: { secretId: secret.id, action: "read" },
      orderBy: { createdAt: "desc" },
    });
    expect(after.length).toBe(before + 1);
    expect(after[0]).toMatchObject({ outcome: "resolved", configPath: "GIT_TOKEN" });
  });

  it("carries consumer provenance when supplied", async () => {
    const secret = await createSecret({
      workspaceId: WS,
      name: "API_KEY",
      value: "k",
      createdBy: "u1",
    });
    await resolveWorkspaceSecret(WS, "API_KEY", {
      actorType: "agent",
      consumerType: "plugin",
      consumerId: "acme",
      runId: "run-9",
    });
    const ev = await prisma.secretAccessEvent.findFirst({
      where: { secretId: secret.id, action: "read" },
      orderBy: { createdAt: "desc" },
    });
    expect(ev).toMatchObject({ consumerType: "plugin", consumerId: "acme", runId: "run-9" });
  });

  it("an unknown secret name resolves null and records nothing", async () => {
    expect(await resolveWorkspaceSecret(WS, "NOPE")).toBeNull();
  });
});
