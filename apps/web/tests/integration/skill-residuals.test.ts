import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  createSkill,
  updateSkill,
  forkSkill,
  precheckForkTarget,
  reassignSkillFork,
  installCatalogSkill,
  importFromCatalog,
  importSkillFromProjectScan,
  computeSkillUpdateStatus,
} from "../../src/server/services/skills";
import { listCatalogSkills } from "../../src/server/skill-catalog/manifest";

// §3 skills residuals — fork depth (precheck/reassign/diverged), catalog provenance, project-scan import.
const WS = "ws_skill_residuals";
const PUB = "ws_skill_residuals_pub";

beforeEach(async () => {
  await prisma.projectWorkspace.deleteMany({ where: { workspaceId: WS } });
  await prisma.skill.deleteMany({ where: { workspaceId: { in: [WS, PUB] } } });
});

describe("fork depth (§3)", () => {
  it("precheck warns and a second fork is rejected without force, allowed with force", async () => {
    const origin = await createSkill({ workspaceId: WS, name: "Origin", markdown: "# v1" });

    const pre0 = await precheckForkTarget(WS, origin.id);
    expect(pre0.hasExistingFork).toBe(false);

    await forkSkill(WS, origin.id);
    const pre1 = await precheckForkTarget(WS, origin.id);
    expect(pre1.hasExistingFork).toBe(true);
    expect(pre1.existingForkName).toBe("Origin (fork)");

    // duplicate fork rejected unless forced
    await expect(forkSkill(WS, origin.id)).rejects.toThrow(/already has a fork/);
    const forced = await forkSkill(WS, origin.id, null, { force: true });
    expect(forced.forkedFromSkillId).toBe(origin.id);
    expect(forced.sourceBadge).toBe("forked");
  });

  it("diverged-detection flips when the origin content changes after the fork", async () => {
    const origin = await createSkill({ workspaceId: WS, name: "Origin", markdown: "# v1" });
    const fork = await forkSkill(WS, origin.id);

    // fresh fork tracks its origin exactly
    expect((await computeSkillUpdateStatus(WS, fork.id)).state).toBe("up_to_date");

    // origin advances → the fork is now diverged from its pinned baseline
    await updateSkill(WS, origin.id, { markdown: "# v2 upstream change" });
    const status = await computeSkillUpdateStatus(WS, fork.id);
    expect(status.state).toBe("diverged");

    // deleting the origin severs the lineage (forkedFromSkillId FK is onDelete: SetNull), so the fork
    // reports not_installed rather than tracking a phantom origin.
    await prisma.skill.delete({ where: { id: origin.id } });
    expect((await computeSkillUpdateStatus(WS, fork.id)).state).toBe("not_installed");
  });

  it("reassign repoints the fork's origin and re-pins the diverged baseline", async () => {
    const originA = await createSkill({ workspaceId: WS, name: "A", markdown: "# a" });
    const originB = await createSkill({ workspaceId: WS, name: "B", markdown: "# b" });
    const fork = await forkSkill(WS, originA.id);
    await updateSkill(WS, originA.id, { markdown: "# a changed" }); // fork now diverged from A
    expect((await computeSkillUpdateStatus(WS, fork.id)).state).toBe("diverged");

    const reassigned = await reassignSkillFork(WS, fork.id, originB.id);
    expect(reassigned.forkedFromSkillId).toBe(originB.id);
    // baseline re-pinned to B's current content → up_to_date against the new origin
    expect((await computeSkillUpdateStatus(WS, fork.id)).state).toBe("up_to_date");
    // forkCounts moved from A to B
    const a = await prisma.skill.findUniqueOrThrow({ where: { id: originA.id } });
    const b = await prisma.skill.findUniqueOrThrow({ where: { id: originB.id } });
    expect(a.forkCount).toBe(0);
    expect(b.forkCount).toBe(1);
  });
});

describe("catalog provenance population (§3)", () => {
  it("importFromCatalog stamps catalogKey/packageVersion/catalogKind + sourceBadge", async () => {
    const entry = listCatalogSkills()[0];
    expect(entry).toBeTruthy();
    const skill = await importFromCatalog({ workspaceId: WS, ref: entry.id });
    expect(skill.sourceBadge).toBe("catalog");
    expect(skill.catalogKey).toBe(entry.key);
    expect(skill.packageVersion).toBe(entry.packageVersion);
    expect(skill.catalogKind).toBe(entry.tier);
    expect(skill.packageName).toBe(entry.packageName);
  });

  it("installCatalogSkill (public copy) stamps a catalog source badge", async () => {
    const src = await createSkill({ workspaceId: PUB, name: "Public", markdown: "# pub" });
    await prisma.skill.update({ where: { id: src.id }, data: { sharingScope: "public" } });
    const installed = await installCatalogSkill(WS, src.id);
    expect(installed.sourceBadge).toBe("catalog");
  });
});

describe("project-workspace scan import (§3)", () => {
  it("imports a SKILL.md discovered in a project workspace with project_scan provenance", async () => {
    const pw = await prisma.projectWorkspace.create({
      data: { workspaceId: WS, projectId: "proj_1", name: "primary", cwd: "/unused" },
    });
    const files = [
      { path: "README.md", content: "repo" },
      {
        path: "skills/pdf/SKILL.md",
        content: "---\nname: PDF Wizard\nkey: pdf-wizard\ndescription: PDFs\n---\n# PDF Wizard",
      },
      { path: "skills/pdf/scripts/extract.sh", content: "pdftotext $1" },
    ];

    const skill = await importSkillFromProjectScan({
      workspaceId: WS,
      projectWorkspaceId: pw.id,
      dir: "skills/pdf",
      listFiles: async () => files,
    });

    expect(skill.name).toBe("PDF Wizard");
    expect(skill.key).toBe("pdf-wizard");
    expect(skill.sourceType).toBe("project_scan");
    expect(skill.sourceBadge).toBe("project");
    expect(skill.sourceRef).toBe(`project:${pw.id}#skills/pdf`);
    // a scripts/ file present → trust auto-raised
    expect(skill.trustLevel).toBe("scripts_executables");
    const attached = await prisma.skillFile.findMany({ where: { skillId: skill.id } });
    expect(attached.map((f) => f.path)).toContain("scripts/extract.sh");
  });

  it("rejects a dir that has no SKILL.md bundle", async () => {
    const pw = await prisma.projectWorkspace.create({
      data: { workspaceId: WS, projectId: "proj_1", name: "primary", cwd: "/unused" },
    });
    await expect(
      importSkillFromProjectScan({
        workspaceId: WS,
        projectWorkspaceId: pw.id,
        dir: "nope",
        listFiles: async () => [{ path: "docs/a.md", content: "x" }],
      }),
    ).rejects.toThrow(/no SKILL\.md bundles|no skill bundle found/);
  });
});
