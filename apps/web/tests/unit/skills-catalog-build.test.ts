import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Exercises the real build step (packages/skills-catalog/scripts/build-catalog.mjs) against a fixture
// tree via the SKILLS_CATALOG_SRC/OUT env overrides — it must produce a valid content-addressed
// manifest, fail closed on a lint error, and be deterministic (byte-identical on re-run).
const SCRIPT = join(__dirname, "../../../../packages/skills-catalog/scripts/build-catalog.mjs");

let root: string;
const runBuild = (src: string, out: string) =>
  execFileSync("node", [SCRIPT], {
    env: {
      ...process.env,
      SKILLS_CATALOG_SRC: src,
      SKILLS_CATALOG_OUT: out,
      SKILLS_CATALOG_REF: "",
    },
    encoding: "utf8",
  });

function writeSkill(src: string, tier: string, category: string, slug: string, md: string) {
  const dir = join(src, tier, category, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), md);
}

const goodSkill = (slug: string, category: string) =>
  [
    "---",
    `name: ${slug} skill`,
    `slug: ${slug}`,
    `description: a fixture skill for ${slug}`,
    `category: ${category}`,
    "tags: [alpha, beta]",
    "recommendedForRoles: [engineer]",
    "---",
    "",
    `# ${slug}`,
    "",
    "Body content.",
  ].join("\n");

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "skills-catalog-fixture-"));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("build-catalog.mjs (fixture tree)", () => {
  it("produces a valid content-addressed manifest", () => {
    const src = join(root, "ok");
    const out = join(root, "ok.json");
    writeSkill(src, "bundled", "engineering", "alpha", goodSkill("alpha", "engineering"));
    writeSkill(src, "optional", "content", "beta", goodSkill("beta", "content"));
    runBuild(src, out);

    const manifest = JSON.parse(readFileSync(out, "utf8"));
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.packageName).toBe("@agentcenter/skills-catalog");
    expect(manifest.skills).toHaveLength(2);

    const alpha = manifest.skills.find((s: { slug: string }) => s.slug === "alpha");
    expect(alpha.id).toBe("skl_alpha");
    expect(alpha.tier).toBe("bundled");
    expect(alpha.category).toBe("engineering");
    expect(alpha.trustLevel).toBe("markdown_only");
    expect(alpha.tags).toEqual(["alpha", "beta"]);
    expect(alpha.recommendedForRoles).toEqual(["engineer"]);
    expect(alpha.files[0].path).toBe("SKILL.md");
    expect(alpha.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // skills are sorted by id for reproducibility
    expect(manifest.skills.map((s: { id: string }) => s.id)).toEqual(["skl_alpha", "skl_beta"]);
  });

  it("is deterministic — a re-run yields a byte-identical file", () => {
    const src = join(root, "det");
    const out = join(root, "det.json");
    writeSkill(src, "bundled", "engineering", "gamma", goodSkill("gamma", "engineering"));
    runBuild(src, out);
    const first = readFileSync(out, "utf8");
    runBuild(src, out);
    expect(readFileSync(out, "utf8")).toBe(first);
  });

  it("fails the build on a lint error (missing frontmatter fields)", () => {
    const src = join(root, "bad");
    const out = join(root, "bad.json");
    // Missing description + slug + category → lint errors → non-zero exit.
    writeSkill(src, "bundled", "engineering", "broken", "---\nname: broken\n---\n\n# broken\n");
    expect(() => runBuild(src, out)).toThrow();
  });
});
