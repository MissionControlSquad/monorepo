import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../../src/server/prisma";
import { setTrustProfile, getTrustProfile } from "../../src/server/services/trust";

// Gap-fill: setTrustProfile keeps a DENORMALIZED cache (Agent.trustLevel) in sync with the source of
// truth (AgentTrustProfile.trustLevel) inside one transaction. Every other test writes agentTrustProfile
// directly via Prisma, bypassing this service — so the invariant "the two are never out of sync" was
// untested. This asserts it on both the create and the update path.

const WS = "ws_trustsync";

async function makeAgent(): Promise<string> {
  const a = await prisma.agent.create({
    data: { name: "trust-sync-agent", role: "Developer", workspaceId: WS },
  });
  return a.id;
}

beforeEach(async () => {
  await prisma.agentTrustProfile.deleteMany({ where: { workspaceId: WS } });
  await prisma.agent.deleteMany({ where: { workspaceId: WS } });
});

afterAll(async () => {
  await prisma.agentTrustProfile.deleteMany({ where: { workspaceId: WS } });
  await prisma.agent.deleteMany({ where: { workspaceId: WS } });
});

describe("setTrustProfile denormalization invariant", () => {
  it("creates the profile AND stamps the denormalized Agent.trustLevel cache", async () => {
    const agentId = await makeAgent();

    const profile = await setTrustProfile({ agentId, workspaceId: WS, trustLevel: "trusted" });
    expect(profile.trustLevel).toBe("trusted");

    const [stored, agent] = await Promise.all([
      getTrustProfile(agentId),
      prisma.agent.findUnique({ where: { id: agentId } }),
    ]);
    expect(stored?.trustLevel).toBe("trusted");
    expect(agent?.trustLevel).toBe("trusted"); // cache in sync with source of truth
  });

  it("keeps the cache in sync on the UPDATE path, not just create", async () => {
    const agentId = await makeAgent();

    await setTrustProfile({ agentId, workspaceId: WS, trustLevel: "trusted" });
    await setTrustProfile({ agentId, workspaceId: WS, trustLevel: "low" });

    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    const stored = await getTrustProfile(agentId);
    expect(stored?.trustLevel).toBe("low");
    expect(agent?.trustLevel).toBe("low");
  });
});
