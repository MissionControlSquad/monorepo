import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  createKeyClaim,
  claimAgentKey,
  revokeKeyClaim,
} from "../../src/server/services/agent-key-claims";
import { hashApiKey } from "../../src/server/api-key";

// Parity Domain-10 A13 / GAP-5 — one-time agent-key claim ceremony.
const WS = "ws_keyclaim";

beforeEach(async () => {
  await prisma.agentKeyClaim.deleteMany({ where: { workspaceId: WS } });
  await prisma.agent.deleteMany({ where: { workspaceId: WS } });
});

describe("agent key claims (GAP-5)", () => {
  it("mints a claim (hash-only) and redeems it once, issuing + binding a scoped key", async () => {
    const agent = await prisma.agent.create({
      data: {
        name: "A",
        role: "worker",
        personality: "x",
        workspaceId: WS,
        username: `kc-${Date.now()}`,
        setupStatus: "active",
        apiKeyHash: "placeholder",
      },
    });
    const { claim, claimSecret } = await createKeyClaim({ workspaceId: WS, agentId: agent.id });
    // secret is not stored in plaintext
    expect(claim.claimSecretHash).not.toBe(claimSecret);

    const { agentKey, agentId } = await claimAgentKey(claim.id, claimSecret);
    expect(agentKey).toMatch(/^mc_/);
    expect(agentId).toBe(agent.id);
    // the agent's key hash was updated to the issued key
    expect((await prisma.agent.findUnique({ where: { id: agent.id } }))?.apiKeyHash).toBe(
      hashApiKey(agentKey),
    );
    // claim burned
    const burned = await prisma.agentKeyClaim.findUnique({ where: { id: claim.id } });
    expect(burned?.status).toBe("claimed");
    expect(burned?.claimSecretHash).toBeNull();
  });

  it("rejects a second claim, a wrong secret, and an expired claim", async () => {
    const { claim, claimSecret } = await createKeyClaim({ workspaceId: WS });
    await claimAgentKey(claim.id, claimSecret);
    await expect(claimAgentKey(claim.id, claimSecret)).rejects.toThrow(/already used/);

    const { claim: c2, claimSecret: s2 } = await createKeyClaim({ workspaceId: WS });
    await expect(claimAgentKey(c2.id, "wrong")).rejects.toThrow(/Invalid claim secret/);

    const { claim: c3, claimSecret: s3 } = await createKeyClaim({ workspaceId: WS });
    await prisma.agentKeyClaim.update({
      where: { id: c3.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(claimAgentKey(c3.id, s3)).rejects.toThrow(/expired/);
    void s2;
  });

  it("revoke burns a pending claim", async () => {
    const { claim, claimSecret } = await createKeyClaim({ workspaceId: WS });
    expect(await revokeKeyClaim(WS, claim.id)).toBe(true);
    await expect(claimAgentKey(claim.id, claimSecret)).rejects.toThrow(/used or revoked/);
  });
});
