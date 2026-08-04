import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import {
  requireAgentCapability,
  grantAgentCapability,
} from "../../src/server/services/agent-authz";
import { AGENT_CAPABILITY } from "@agentcenter/utils";
import { createTestAgent } from "../helpers";

// Parity #9/#10 — the agent capability ENFORCEMENT machinery (requireAgentCapability).
let agentId = "";
let role = "worker";

async function enableAuthz(on = true) {
  await prisma.featureFlag.upsert({
    where: { key: "agent_authz" },
    create: { key: "agent_authz", enabled: on, managedBy: "system" },
    update: { enabled: on },
  });
  invalidateFlagCache();
}

async function setRestricted(restricted: boolean) {
  await prisma.agentTrustProfile.upsert({
    where: { agentId },
    create: { agentId, workspaceId: "ws_authz", changeConsentRequired: restricted },
    update: { changeConsentRequired: restricted },
  });
}

beforeEach(async () => {
  await prisma.agentAuthzEvent.deleteMany({});
  await prisma.agentCapabilityGrant.deleteMany({});
  await prisma.agentTrustProfile.deleteMany({});
  await prisma.featureFlag.deleteMany({ where: { key: "agent_authz" } });
  invalidateFlagCache();
  const { agent } = await createTestAgent({ role: "worker" });
  agentId = agent.id;
  role = agent.role;
  await prisma.agent.update({ where: { id: agentId }, data: { workspaceId: "ws_authz" } });
});

const agent = () => ({ id: agentId, role });

describe("requireAgentCapability (#9/#10)", () => {
  it("is a no-op when AGENT_AUTHZ is disabled (kill-switch)", async () => {
    await enableAuthz(false);
    await setRestricted(true);
    await expect(
      requireAgentCapability(agent(), AGENT_CAPABILITY.PR_MERGE),
    ).resolves.toBeUndefined();
  });

  it("open mode (no change-consent) allows everything, even elevated caps", async () => {
    await enableAuthz(true);
    await setRestricted(false);
    await expect(
      requireAgentCapability(agent(), AGENT_CAPABILITY.PR_MERGE),
    ).resolves.toBeUndefined();
  });

  it("restricted agent keeps base capabilities (role default) but is denied elevated ones", async () => {
    await enableAuthz(true);
    await setRestricted(true);
    // base cap → allowed via role default
    await expect(
      requireAgentCapability(agent(), AGENT_CAPABILITY.TASKS_COMPLETE),
    ).resolves.toBeUndefined();
    // elevated cap → denied + a DENY authz event recorded
    await expect(requireAgentCapability(agent(), AGENT_CAPABILITY.PR_MERGE)).rejects.toMatchObject({
      extensions: { code: "FORBIDDEN", capability: AGENT_CAPABILITY.PR_MERGE },
    });
    const events = await prisma.agentAuthzEvent.findMany({ where: { agentId } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ capability: AGENT_CAPABILITY.PR_MERGE, decision: "deny" });
  });

  it("an explicit grant unblocks the elevated capability for a restricted agent", async () => {
    await enableAuthz(true);
    await setRestricted(true);
    await grantAgentCapability({
      agentId,
      workspaceId: "ws_authz",
      capability: AGENT_CAPABILITY.PR_MERGE,
    });
    await expect(
      requireAgentCapability(agent(), AGENT_CAPABILITY.PR_MERGE),
    ).resolves.toBeUndefined();
  });
});
