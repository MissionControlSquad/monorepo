import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { importSkillPackage } from "../../src/server/services/skills";

// Parity Domain 5 F16 — import a skill from a package of files.
const WS = "ws_skillimport";

beforeEach(async () => {
  await prisma.skill.deleteMany({ where: { workspaceId: WS } });
});

const PKG = [
  {
    path: "SKILL.md",
    content:
      "---\nname: PDF Wizard\nkey: pdf-wizard\ndescription: Handles PDFs\ntags:\n  - docs\n---\n# PDF Wizard\nDo PDF things.",
  },
  { path: "scripts/extract.sh", content: "pdftotext $1" },
  { path: "assets/logo.png", content: "binary" },
];

describe("importSkillPackage (#F16)", () => {
  it("creates a skill from SKILL.md frontmatter + attaches files, deriving trust", async () => {
    const skill = await importSkillPackage({
      workspaceId: WS,
      files: PKG,
      sourceRef: "https://x/pkg.zip",
    });
    expect(skill.name).toBe("PDF Wizard");
    expect(skill.key).toBe("pdf-wizard");
    expect(skill.description).toBe("Handles PDFs");
    expect(skill.sourceRef).toBe("https://x/pkg.zip");
    // a scripts/ file present → trust raised to scripts_executables (via upsertSkillFile re-derivation)
    expect(skill.trustLevel).toBe("scripts_executables");

    const files = await prisma.skillFile.findMany({ where: { skillId: skill.id } });
    expect(files.map((f) => f.path).sort()).toEqual(["assets/logo.png", "scripts/extract.sh"]);
  });

  it("rejects a package with no SKILL.md", async () => {
    await expect(
      importSkillPackage({ workspaceId: WS, files: [{ path: "readme.txt", content: "hi" }] }),
    ).rejects.toThrow(/no SKILL\.md/);
  });

  it("skips an unsafe traversal path rather than aborting the import", async () => {
    const skill = await importSkillPackage({
      workspaceId: WS,
      files: [
        { path: "SKILL.md", content: "---\nname: Safe\n---\n# Safe" },
        { path: "../../etc/passwd", content: "evil" },
        { path: "docs/ok.md", content: "fine" },
      ],
    });
    const files = await prisma.skillFile.findMany({ where: { skillId: skill.id } });
    expect(files.map((f) => f.path)).toContain("docs/ok.md");
    expect(files.some((f) => f.path.includes(".."))).toBe(false);
  });
});
