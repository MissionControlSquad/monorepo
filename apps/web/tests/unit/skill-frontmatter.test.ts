import { describe, it, expect } from "vitest";
import {
  parseSkillFrontmatter,
  splitFrontmatter,
  classifySkillFile,
  deriveSkillTrustLevel,
  lintSkill,
} from "@agentcenter/utils";

const SKILL = `---
name: QA Acceptance
description: Verify acceptance criteria before shipping
slug: qa-acceptance
recommendedForRoles: [qa, engineer]
requires:
  - test-runner
tags: [testing, quality]
defaultInstall: true
---
# QA Acceptance

Do the thing.
`;

describe("parseSkillFrontmatter (Domain 5 GAP-A)", () => {
  it("returns null when there is no frontmatter", () => {
    expect(parseSkillFrontmatter("# Just markdown\n")).toBeNull();
    expect(splitFrontmatter("# Just markdown").raw).toBeNull();
  });

  it("parses scalars, inline lists and block lists, coercing booleans", () => {
    const fm = parseSkillFrontmatter(SKILL);
    expect(fm).toMatchObject({
      name: "QA Acceptance",
      description: "Verify acceptance criteria before shipping",
      slug: "qa-acceptance",
      recommendedForRoles: ["qa", "engineer"],
      requires: ["test-runner"],
      tags: ["testing", "quality"],
      defaultInstall: true,
    });
    // the body is preserved after the fence
    expect(splitFrontmatter(SKILL).body).toContain("# QA Acceptance");
  });
});

describe("classifySkillFile + deriveSkillTrustLevel", () => {
  it("classifies by path/extension", () => {
    expect(classifySkillFile("SKILL.md")).toBe("skill");
    expect(classifySkillFile("references/api.md")).toBe("reference");
    expect(classifySkillFile("scripts/run.py")).toBe("script");
    expect(classifySkillFile("build.sh")).toBe("script");
    expect(classifySkillFile("assets/logo.png")).toBe("asset");
    expect(classifySkillFile("notes.md")).toBe("markdown");
    expect(classifySkillFile("data.bin")).toBe("asset");
    expect(classifySkillFile("weird.xyz")).toBe("other");
  });

  it("derives the trust ladder from bundle file kinds", () => {
    expect(deriveSkillTrustLevel(["SKILL.md", "references/api.md"])).toBe("markdown_only");
    expect(deriveSkillTrustLevel(["SKILL.md", "assets/logo.png"])).toBe("assets");
    expect(deriveSkillTrustLevel(["SKILL.md", "assets/logo.png", "scripts/x.sh"])).toBe(
      "scripts_executables",
    );
  });
});

describe("lintSkill frontmatter + path-safety (GAP-A)", () => {
  it("requireFrontmatter flags a missing block and missing name/description", () => {
    const findings = lintSkill({
      markdown: "# No frontmatter",
      files: [],
      requireFrontmatter: true,
    });
    expect(findings.some((f) => /missing YAML frontmatter/.test(f.message))).toBe(true);

    const partial = lintSkill({
      markdown: "---\nname: X\n---\n# X",
      files: [],
      requireFrontmatter: true,
    });
    expect(partial.some((f) => /missing 'description'/.test(f.message))).toBe(true);
  });

  it("a valid SKILL.md passes with requireFrontmatter", () => {
    expect(lintSkill({ markdown: SKILL, files: [], requireFrontmatter: true })).toEqual([]);
  });

  it("flags an unsafe (traversal/absolute) bundle file path as an error", () => {
    const findings = lintSkill({
      markdown: "# ok",
      files: [
        { path: "../escape.sh", content: "x" },
        { path: "/etc/passwd", content: "x" },
        { path: "scripts/ok.sh", content: "echo hi" },
      ],
    });
    const unsafe = findings.filter((f) => /unsafe/.test(f.message));
    expect(unsafe.map((f) => f.path).sort()).toEqual(["../escape.sh", "/etc/passwd"]);
  });

  it("does not require frontmatter by default (free-text skills lint clean)", () => {
    expect(
      lintSkill({ markdown: "# Plain skill\n\nbody", files: [] }).some((f) => f.level === "error"),
    ).toBe(false);
  });
});
