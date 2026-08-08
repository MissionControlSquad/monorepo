import { describe, it, expect, vi } from "vitest";
import {
  planSkillSource,
  parseGitHubSource,
  parseUrlSource,
  parseCatalogSource,
  resolveSkillSource,
  SkillSourceError,
} from "@/server/services/skill-import-sources";
import { getCatalogEntry, listCatalogSkills } from "@/server/skill-catalog/manifest";

// Pure resolvers for the Domain 5 real-import layer. Network is mocked; catalog reads the in-repo
// manifest. Covers: GitHub URL/shorthand → raw fetch plan, raw URL, catalog ref → manifest entry, and
// clear errors for bad sources.

function okResponse(body: string) {
  return { ok: true, status: 200, text: async () => body };
}
function errResponse(status: number) {
  return { ok: false, status, text: async () => "" };
}

describe("parseGitHubSource", () => {
  it("parses owner/repo shorthand → SKILL.md at HEAD", () => {
    const p = parseGitHubSource("acme/skills");
    expect(p.owner).toBe("acme");
    expect(p.repo).toBe("skills");
    expect(p.ref).toBe("HEAD");
    expect(p.path).toBe("SKILL.md");
    expect(p.rawUrl).toBe("https://raw.githubusercontent.com/acme/skills/HEAD/SKILL.md");
  });

  it("parses a github.com blob URL with ref + path", () => {
    const p = parseGitHubSource("https://github.com/acme/skills/blob/main/writer/SKILL.md");
    expect(p.ref).toBe("main");
    expect(p.path).toBe("writer/SKILL.md");
    expect(p.rawUrl).toBe("https://raw.githubusercontent.com/acme/skills/main/writer/SKILL.md");
    expect(p.locator).toBe("acme/skills/writer/SKILL.md@main");
  });

  it("appends SKILL.md when the path points at a folder", () => {
    const p = parseGitHubSource("https://github.com/acme/skills/tree/v2/bundles/writer");
    expect(p.ref).toBe("v2");
    expect(p.path).toBe("bundles/writer/SKILL.md");
  });

  it("strips a trailing .git from the repo", () => {
    expect(parseGitHubSource("acme/skills.git").repo).toBe("skills");
  });

  it("throws a clear error when owner/repo is missing", () => {
    expect(() => parseGitHubSource("https://github.com/acme")).toThrow(SkillSourceError);
  });
});

describe("parseUrlSource", () => {
  it("accepts an https raw URL", () => {
    const p = parseUrlSource("https://example.com/a/SKILL.md");
    expect(p.kind).toBe("url");
    expect(p.url).toBe("https://example.com/a/SKILL.md");
  });
  it("rejects a non-http scheme", () => {
    expect(() => parseUrlSource("ftp://example.com/x")).toThrow(/only http/i);
  });
  it("rejects a malformed URL", () => {
    expect(() => parseUrlSource("not a url")).toThrow(SkillSourceError);
  });
});

describe("parseCatalogSource", () => {
  it("strips the catalog: prefix", () => {
    expect(parseCatalogSource("catalog:technical-writer").ref).toBe("technical-writer");
  });
  it("accepts a bare ref", () => {
    expect(parseCatalogSource("technical-writer").ref).toBe("technical-writer");
  });
  it("throws on an empty ref", () => {
    expect(() => parseCatalogSource("catalog:")).toThrow(SkillSourceError);
  });
});

describe("planSkillSource (dispatch)", () => {
  it("routes catalog:… to catalog", () => {
    expect(planSkillSource("catalog:technical-writer").kind).toBe("catalog");
  });
  it("routes a github.com URL to github", () => {
    expect(planSkillSource("https://github.com/acme/skills").kind).toBe("github");
  });
  it("routes owner/repo shorthand to github", () => {
    expect(planSkillSource("acme/skills").kind).toBe("github");
  });
  it("routes a plain https URL to url", () => {
    expect(planSkillSource("https://example.com/SKILL.md").kind).toBe("url");
  });
  it("throws a clear error for an unrecognized spec", () => {
    expect(() => planSkillSource("")).toThrow(/source is required/i);
    expect(() => planSkillSource("just-a-word")).toThrow(SkillSourceError);
  });
});

describe("resolveSkillSource (with mocked fetch)", () => {
  const SKILL_MD = "---\nname: Demo\nkey: demo\n---\n# Demo\nBody.";

  it("resolves a GitHub source: fetches the raw URL + stamps provenance", async () => {
    const fetchImpl = vi.fn(async () => okResponse(SKILL_MD));
    const res = await resolveSkillSource("acme/skills/writer", { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/acme/skills/HEAD/writer/SKILL.md",
    );
    expect(res.files).toEqual([{ path: "SKILL.md", content: SKILL_MD }]);
    expect(res.provenance.sourceType).toBe("github");
    expect(res.provenance.packageName).toBe("acme/skills");
    expect(res.provenance.sourceRef).toBe("acme/skills/writer/SKILL.md@HEAD");
    expect(res.provenance.originHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("resolves a raw URL source", async () => {
    const fetchImpl = vi.fn(async () => okResponse(SKILL_MD));
    const res = await resolveSkillSource("https://example.com/x/SKILL.md", { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.com/x/SKILL.md");
    expect(res.provenance.sourceType).toBe("url");
    expect(res.provenance.packageName).toBeNull();
  });

  it("resolves a catalog ref from the in-repo manifest (no fetch)", async () => {
    const fetchImpl = vi.fn(async () => okResponse(""));
    const res = await resolveSkillSource("catalog:technical-writer", { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(res.provenance.sourceType).toBe("catalog");
    expect(res.provenance.packageName).toBe("@agentcenter/skills-catalog");
    expect(res.files[0]?.path).toBe("SKILL.md");
    // originHash equals the entry's contentHash (content-addressed).
    expect(res.provenance.originHash).toBe(getCatalogEntry("technical-writer")?.contentHash);
  });

  it("errors clearly on an unknown catalog ref", async () => {
    await expect(resolveSkillSource("catalog:nope")).rejects.toThrow(/not found/i);
  });

  it("errors clearly on a non-OK fetch", async () => {
    const fetchImpl = vi.fn(async () => errResponse(404));
    await expect(resolveSkillSource("acme/skills", { fetchImpl })).rejects.toThrow(/HTTP 404/);
  });

  it("errors clearly on an empty fetched document", async () => {
    const fetchImpl = vi.fn(async () => okResponse("   "));
    await expect(resolveSkillSource("https://example.com/x", { fetchImpl })).rejects.toThrow(
      /empty document/i,
    );
  });
});

describe("catalog manifest", () => {
  it("ships content-addressed bundled skills with SKILL.md + hashes", () => {
    const skills = listCatalogSkills();
    expect(skills.length).toBeGreaterThanOrEqual(3);
    for (const s of skills) {
      expect(s.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(s.files[0]?.path).toBe("SKILL.md");
      expect(s.files[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(s.files[0]?.content).toMatch(/^---\n/); // frontmatter prepended
    }
  });
  it("resolves entries by id and by key", () => {
    const byKey = getCatalogEntry("technical-writer");
    expect(byKey?.name).toBe("Technical Writer");
    expect(getCatalogEntry(byKey!.id)?.id).toBe(byKey!.id);
    expect(getCatalogEntry("does-not-exist")).toBeNull();
  });
});
