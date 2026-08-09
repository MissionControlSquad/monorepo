import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  createSkill,
  updateSkill,
  installCatalogSkill,
  upsertSkillFile,
  computeSkillUpdateStatus,
  resetSkillToOrigin,
} from "../../src/server/services/skills";

// Parity Domain 5 F13/F18/F20 — catalog-install provenance + update-drift + reset-to-origin.
const PUB = "ws_pub";
const INST = "ws_installer";

beforeEach(async () => {
  await prisma.skill.deleteMany({ where: { workspaceId: { in: [PUB, INST] } } });
});

async function publishedSource() {
  const s = await createSkill({ workspaceId: PUB, name: "Shared Skill", markdown: "# v1" });
  await prisma.skill.update({ where: { id: s.id }, data: { sharingScope: "public" } });
  return s;
}

describe("skill catalog lifecycle (F13/F18/F20)", () => {
  it("install stamps origin provenance", async () => {
    const source = await publishedSource();
    const installed = await installCatalogSkill(INST, source.id);
    expect(installed.originSkillId).toBe(source.id);
    expect(installed.originVersion).toBe(source.currentVersion);
    expect((await computeSkillUpdateStatus(INST, installed.id)).state).toBe("up_to_date");
  });

  it("detects update_available when the source advances", async () => {
    const source = await publishedSource();
    const installed = await installCatalogSkill(INST, source.id);
    // source publishes a new revision (markdown change bumps currentVersion)
    await updateSkill(PUB, source.id, { markdown: "# v2 improved" });

    const status = await computeSkillUpdateStatus(INST, installed.id);
    expect(status.state).toBe("update_available");
    expect(status.latestVersion).toBeGreaterThan(status.originVersion!);
  });

  it("reset-to-origin re-syncs content + files and re-pins the version", async () => {
    const source = await publishedSource();
    await upsertSkillFile(PUB, source.id, { path: "docs/readme.md", content: "src doc" });
    const installed = await installCatalogSkill(INST, source.id);

    // installer diverges locally, source advances
    await updateSkill(INST, installed.id, { markdown: "# my local edits" });
    await updateSkill(PUB, source.id, { markdown: "# v2 upstream" });

    const reset = await resetSkillToOrigin(INST, installed.id);
    expect(reset.markdown).toBe("# v2 upstream");
    const files = await prisma.skillFile.findMany({ where: { skillId: installed.id } });
    expect(files.map((f) => f.path)).toContain("docs/readme.md");
    expect((await computeSkillUpdateStatus(INST, installed.id)).state).toBe("up_to_date");
  });

  it("a non-installed skill reports not_installed and can't be reset", async () => {
    const local = await createSkill({ workspaceId: INST, name: "Local", markdown: "# x" });
    expect((await computeSkillUpdateStatus(INST, local.id)).state).toBe("not_installed");
    await expect(resetSkillToOrigin(INST, local.id)).rejects.toThrow(
      /not installed from a catalog/,
    );
  });
});
