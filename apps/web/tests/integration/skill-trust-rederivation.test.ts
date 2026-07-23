import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { createSkill, upsertSkillFile, deleteSkillFile } from "../../src/server/services/skills";

// Regression (Domain 5 F3): a skill's stored trustLevel must be re-derived from its file set — adding a
// script must raise the rung to scripts_executables; removing it lowers it back.
const WS = "ws_skilltrust";

beforeEach(async () => {
  await prisma.skill.deleteMany({ where: { workspaceId: WS } });
});

describe("skill trust re-derivation (F3)", () => {
  it("adding a script raises trustLevel; removing it lowers it", async () => {
    const skill = await createSkill({ workspaceId: WS, name: "My Skill", markdown: "# hi" });
    expect(skill.trustLevel).toBe("markdown_only");

    await upsertSkillFile(WS, skill.id, { path: "scripts/run.sh", content: "echo hi" });
    let after = await prisma.skill.findUnique({ where: { id: skill.id } });
    expect(after?.trustLevel).toBe("scripts_executables");

    await deleteSkillFile(WS, skill.id, "scripts/run.sh");
    after = await prisma.skill.findUnique({ where: { id: skill.id } });
    expect(after?.trustLevel).toBe("markdown_only");
  });

  it("an asset file raises trust to assets (below scripts)", async () => {
    const skill = await createSkill({ workspaceId: WS, name: "Asset Skill", markdown: "# hi" });
    await upsertSkillFile(WS, skill.id, { path: "assets/logo.png", content: "x" });
    const after = await prisma.skill.findUnique({ where: { id: skill.id } });
    expect(after?.trustLevel).toBe("assets");
  });
});
