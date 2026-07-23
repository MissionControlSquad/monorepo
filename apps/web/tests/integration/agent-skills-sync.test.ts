import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  getAgentSkillSnapshot,
  syncAgentSkills,
} from "../../src/server/services/agent-skills-sync";
import { createSkill } from "../../src/server/services/skills";

// Parity Domain 5 F22 — agent skill sync snapshot + set desired.
const WS = "ws_skillsync";
let agentId = "";

beforeEach(async () => {
  await prisma.agent.deleteMany({ where: { workspaceId: WS } });
  await prisma.skill.deleteMany({ where: { workspaceId: WS } });
  const agent = await prisma.agent.create({
    data: {
      name: "SkillBot",
      role: "worker",
      personality: "x",
      workspaceId: WS,
      username: `skillsync-${Date.now()}`,
      setupStatus: "active",
      apiKeyHash: `mc_ss_${Date.now()}`,
      runtimeAdapter: "claude", // persistent mode
    },
  });
  agentId = agent.id;
});

describe("agent skill sync (#F22)", () => {
  it("syncAgentSkills sets desired skills; snapshot reconciles (missing with no runtime state)", async () => {
    const s1 = await createSkill({ workspaceId: WS, name: "S1", markdown: "# a" });
    const s2 = await createSkill({ workspaceId: WS, name: "S2", markdown: "# b" });

    const snap = await syncAgentSkills(WS, agentId, [
      { skillId: s1.id },
      { skillId: s2.id, pinnedVersion: 1 },
    ]);
    expect(snap.mode).toBe("persistent");
    // no runtime actual yet → all missing (persistent)
    expect(snap.entries.every((e) => e.state === "missing")).toBe(true);
    expect(await prisma.agentSkill.count({ where: { agentId } })).toBe(2);
  });

  it("snapshot reflects installed/stale against reported runtime state", async () => {
    const s1 = await createSkill({ workspaceId: WS, name: "S1", markdown: "# a" });
    await syncAgentSkills(WS, agentId, [{ skillId: s1.id }]);
    const snap = await getAgentSkillSnapshot(WS, agentId, [
      { skillId: s1.id, installedVersion: 1 },
    ]);
    expect(snap.entries.find((e) => e.skillId === s1.id)?.state).toBe("installed");
  });

  it("ignores skills not readable in the workspace", async () => {
    const snap = await syncAgentSkills(WS, agentId, [{ skillId: "does-not-exist" }]);
    expect(snap.entries).toHaveLength(0);
    expect(await prisma.agentSkill.count({ where: { agentId } })).toBe(0);
  });
});
