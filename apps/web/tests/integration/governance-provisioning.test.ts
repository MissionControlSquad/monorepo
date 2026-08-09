import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { setAgentGovernance } from "../../src/server/services/agent-governance";
import { importCompanyPackage } from "../../src/server/services/agent-companies";

// Regression (Domain 14): the requireAgentApproval provisioning gate must apply to EVERY agent-creation
// path, not just team-install. Company-imported agents must land pending_setup when the gate is on.
const WS = "ws_govprov";

const PACKAGE = [
  { path: "COMPANY.md", content: "---\nname: Acme\nslug: acme\n---\nAcme co." },
  {
    path: "agents/ceo/AGENTS.md",
    content: "---\nname: Ceo\nrole: leader\nslug: ceo\n---\nThe CEO.",
  },
];

beforeEach(async () => {
  await prisma.agent.deleteMany({ where: { workspaceId: WS } });
  await prisma.agentCompany.deleteMany({ where: { workspaceId: WS } });
  await prisma.agentGovernancePolicy.deleteMany({ where: { workspaceId: WS } });
});

describe("governance provisioning gate on company import (Domain 14)", () => {
  it("imported agents are pending_setup when requireAgentApproval is ON", async () => {
    await setAgentGovernance(WS, { requireAgentApproval: true });
    await importCompanyPackage({ workspaceId: WS, files: PACKAGE });
    const agents = await prisma.agent.findMany({ where: { workspaceId: WS } });
    expect(agents.length).toBeGreaterThan(0);
    expect(agents.every((a) => a.setupStatus === "pending_setup")).toBe(true);
  });

  it("imported agents are active when the gate is OFF (default)", async () => {
    await importCompanyPackage({ workspaceId: WS, files: PACKAGE });
    const agents = await prisma.agent.findMany({ where: { workspaceId: WS } });
    expect(agents.length).toBeGreaterThan(0);
    expect(agents.every((a) => a.setupStatus === "active")).toBe(true);
  });
});
