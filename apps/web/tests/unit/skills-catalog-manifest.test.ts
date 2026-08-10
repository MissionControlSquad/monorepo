import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  catalogManifest,
  listCatalogSkills,
  getCatalogEntry,
  CATALOG_PACKAGE_NAME,
  CATALOG_PACKAGE_VERSION,
} from "../../src/server/skill-catalog/manifest";

// The app catalog loader now reads @agentcenter/skills-catalog's generated/catalog.json (a real built
// package) instead of the old 3 hardcoded seeds. These assert the loader returns the expected skills
// with intact content-addressed provenance, and that no originally-shipped seed was dropped.
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("skills-catalog app loader", () => {
  it("loads the packaged, content-addressed manifest", () => {
    const m = catalogManifest();
    expect(m.packageName).toBe("@agentcenter/skills-catalog");
    expect(m.schemaVersion).toBe(1);
    expect(m.skills.length).toBeGreaterThanOrEqual(8);
  });

  it("keeps every originally-shipped seed skill", () => {
    // The three hardcoded seeds the old manifest shipped must all still resolve.
    for (const key of ["technical-writer", "software-architect", "customer-support"]) {
      const entry = getCatalogEntry(key);
      expect(entry, `seed "${key}" must be present`).not.toBeNull();
      expect(entry!.key).toBe(key);
    }
  });

  it("includes the added role/utility skills", () => {
    const keys = listCatalogSkills().map((s) => s.key);
    for (const key of ["frontend-dev", "backend-dev", "qa", "devops", "code-reviewer"])
      expect(keys).toContain(key);
  });

  it("resolves by id and by key, stamping package + content provenance", () => {
    const byKey = getCatalogEntry("technical-writer")!;
    const byId = getCatalogEntry(byKey.id)!;
    expect(byId).toEqual(byKey);
    expect(byKey.name).toBe("Technical Writer");
    expect(byKey.packageName).toBe(CATALOG_PACKAGE_NAME);
    expect(byKey.packageVersion).toBe(CATALOG_PACKAGE_VERSION);
    expect(byKey.files.some((f) => /(^|\/)SKILL\.md$/i.test(f.path))).toBe(true);
  });

  it("carries a verifiable contentHash over its files", () => {
    for (const s of listCatalogSkills()) {
      for (const f of s.files) expect(f.sha256).toBe(sha256(f.content));
      const recomputed = sha256(s.files.map((f) => `${f.path}:${f.sha256}`).join("\n"));
      expect(s.contentHash).toBe(recomputed);
    }
  });

  it("tags each entry with a tier and derives markdown-only trust for single-file skills", () => {
    for (const s of listCatalogSkills()) {
      expect(["bundled", "optional"]).toContain(s.tier);
      expect(s.trustLevel).toBe("markdown_only");
    }
  });

  it("returns null for a blank or unknown ref", () => {
    expect(getCatalogEntry("")).toBeNull();
    expect(getCatalogEntry("does-not-exist")).toBeNull();
  });
});
