import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { importFromCatalog, importSkillFromSource } from "../../src/server/services/skills";
import { getCatalogEntry } from "../../src/server/skill-catalog/manifest";

// Domain 5 real-import — installing a skill from the app-shipped catalog + from a resolved source spec
// through the shared importSkillPackage path, stamping provenance (packageName / originHash / sourceRef).
const WS = "ws_skillcatalogimport";

beforeEach(async () => {
  await prisma.skill.deleteMany({ where: { workspaceId: WS } });
});

describe("importFromCatalog", () => {
  it("installs a catalog entry and stamps content-addressed provenance", async () => {
    const entry = getCatalogEntry("technical-writer")!;
    const skill = await importFromCatalog({ workspaceId: WS, ref: "technical-writer" });
    expect(skill.name).toBe("Technical Writer");
    expect(skill.key).toBe("technical-writer");
    expect(skill.sourceType).toBe("catalog");
    expect(skill.sourceRef).toBe(`catalog:${entry.id}`);
    expect(skill.packageName).toBe("@agentcenter/skills-catalog");
    expect(skill.originHash).toBe(entry.contentHash);
  });

  it("de-dupes the key on a second install rather than colliding", async () => {
    const a = await importFromCatalog({ workspaceId: WS, ref: "technical-writer" });
    const b = await importFromCatalog({ workspaceId: WS, ref: "technical-writer" });
    expect(a.key).toBe("technical-writer");
    expect(b.key).toBe("technical-writer-2");
  });

  it("rejects an unknown catalog ref", async () => {
    await expect(importFromCatalog({ workspaceId: WS, ref: "nope" })).rejects.toThrow(/not found/i);
  });
});

describe("importSkillFromSource (resolver wired to importSkillPackage)", () => {
  it("resolves a catalog: source spec end-to-end and stamps catalog provenance", async () => {
    // A catalog ref exercises the full resolver → importSkillPackage path without touching the network.
    const entry = getCatalogEntry("software-architect")!;
    const skill = await importSkillFromSource({
      workspaceId: WS,
      source: "catalog:software-architect",
    });
    expect(skill.name).toBe("Software Architect");
    expect(skill.sourceType).toBe("catalog");
    expect(skill.sourceRef).toBe(`catalog:${entry.id}`);
    expect(skill.originHash).toBe(entry.contentHash);
  });

  it("surfaces a bad-source error as a user error", async () => {
    await expect(
      importSkillFromSource({ workspaceId: WS, source: "just-a-word" }),
    ).rejects.toThrow();
  });
});
