import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  planSkillSource,
  parseGitHubSource,
  parseGitHubTreeSource,
  parseUrlSource,
  parseLocalSource,
  parseSkillShSource,
  parseCatalogSource,
  assertSafeBundlePath,
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

// ─── Deepened import: multi-file GitHub tree · local-path scan · skills.sh registry ───────────────

describe("parseGitHubTreeSource", () => {
  it("parses a /tree/ folder URL (dir kept, not appended with SKILL.md)", () => {
    const p = parseGitHubTreeSource("https://github.com/acme/skills/tree/main/bundles/writer");
    expect(p.kind).toBe("github-tree");
    expect(p.owner).toBe("acme");
    expect(p.repo).toBe("skills");
    expect(p.ref).toBe("main");
    expect(p.dir).toBe("bundles/writer");
    expect(p.contentsApiUrl).toBe(
      "https://api.github.com/repos/acme/skills/contents/bundles/writer?ref=main",
    );
    expect(p.locator).toBe("acme/skills/bundles/writer@main");
  });

  it("parses a tree: shorthand with an @ref", () => {
    const p = parseGitHubTreeSource("tree:acme/skills/writer@v2");
    expect(p.dir).toBe("writer");
    expect(p.ref).toBe("v2");
    expect(p.contentsApiUrl).toBe(
      "https://api.github.com/repos/acme/skills/contents/writer?ref=v2",
    );
  });

  it("omits the ref query param at HEAD", () => {
    const p = parseGitHubTreeSource("tree:acme/skills/writer");
    expect(p.ref).toBe("HEAD");
    expect(p.contentsApiUrl).toBe("https://api.github.com/repos/acme/skills/contents/writer");
  });
});

describe("parseLocalSource", () => {
  it("strips a local: prefix", () => {
    expect(parseLocalSource("local:/srv/skills/writer").path).toBe("/srv/skills/writer");
  });
  it("accepts a file:// URL", () => {
    expect(parseLocalSource("file:///srv/skills/writer").path).toBe("/srv/skills/writer");
  });
  it("accepts a bare filesystem path", () => {
    expect(parseLocalSource("./bundles/writer").path).toBe("./bundles/writer");
  });
  it("throws on an empty path", () => {
    expect(() => parseLocalSource("local:")).toThrow(SkillSourceError);
  });
});

describe("parseSkillShSource", () => {
  it("parses skillsh:<owner/repo/skill> to the registry API URL", () => {
    const p = parseSkillShSource("skillsh:vercel-labs/skills/find-skills");
    expect(p.kind).toBe("skillsh");
    expect(p.name).toBe("vercel-labs/skills/find-skills");
    expect(p.registryUrl).toBe("https://skills.sh/api/skills/vercel-labs/skills/find-skills");
    expect(p.originalUrl).toBeNull();
    expect(p.locator).toBe("skillsh:vercel-labs/skills/find-skills");
  });
  it("parses a skills.sh URL and preserves the original", () => {
    const p = parseSkillShSource("https://skills.sh/google-labs-code/stitch-skills/design-md");
    expect(p.name).toBe("google-labs-code/stitch-skills/design-md");
    expect(p.originalUrl).toBe("https://skills.sh/google-labs-code/stitch-skills/design-md");
    expect(p.registryUrl).toBe(
      "https://skills.sh/api/skills/google-labs-code/stitch-skills/design-md",
    );
  });
  it("honours a configurable registry base", () => {
    const prev = process.env.SKILLS_SH_REGISTRY_BASE;
    process.env.SKILLS_SH_REGISTRY_BASE = "https://registry.internal";
    try {
      expect(parseSkillShSource("skillsh:acme/x").registryUrl).toBe(
        "https://registry.internal/api/skills/acme/x",
      );
    } finally {
      if (prev === undefined) delete process.env.SKILLS_SH_REGISTRY_BASE;
      else process.env.SKILLS_SH_REGISTRY_BASE = prev;
    }
  });
});

describe("assertSafeBundlePath", () => {
  it("normalizes a safe path", () => {
    expect(assertSafeBundlePath("scripts/run.sh")).toBe("scripts/run.sh");
    expect(assertSafeBundlePath("/SKILL.md")).toBe("SKILL.md");
  });
  it("rejects traversal", () => {
    expect(() => assertSafeBundlePath("../secrets.md")).toThrow(SkillSourceError);
    expect(() => assertSafeBundlePath("a/../../b")).toThrow(SkillSourceError);
  });
});

describe("planSkillSource dispatch — new kinds", () => {
  it("routes a GitHub /tree/ URL to github-tree", () => {
    expect(planSkillSource("https://github.com/acme/skills/tree/main/writer").kind).toBe(
      "github-tree",
    );
  });
  it("routes a GitHub /blob/ URL to github (single file)", () => {
    expect(planSkillSource("https://github.com/acme/skills/blob/main/writer/SKILL.md").kind).toBe(
      "github",
    );
  });
  it("routes local: / file:// / a filesystem path to local", () => {
    expect(planSkillSource("local:/srv/x").kind).toBe("local");
    expect(planSkillSource("file:///srv/x").kind).toBe("local");
    expect(planSkillSource("/srv/x").kind).toBe("local");
    expect(planSkillSource("./x").kind).toBe("local");
  });
  it("routes skillsh: and a skills.sh URL to skillsh", () => {
    expect(planSkillSource("skillsh:acme/x").kind).toBe("skillsh");
    expect(planSkillSource("https://skills.sh/acme/x").kind).toBe("skillsh");
  });
  it("still routes owner/repo shorthand to github (back-compat)", () => {
    expect(planSkillSource("acme/skills").kind).toBe("github");
  });
});

describe("resolveSkillSource — multi-file GitHub tree", () => {
  it("fetches the whole bundle via the contents API and rebases paths to the bundle root", async () => {
    const SKILL = "---\nname: Writer\n---\n# Writer";
    const REF = "reference material";
    const SCRIPT = "#!/bin/sh\necho hi";
    const responses: Record<string, string> = {
      "https://api.github.com/repos/acme/skills/contents/writer?ref=main": JSON.stringify([
        {
          name: "SKILL.md",
          path: "writer/SKILL.md",
          type: "file",
          download_url: "https://raw/writer/SKILL.md",
          url: "u1",
        },
        {
          name: "reference.md",
          path: "writer/reference.md",
          type: "file",
          download_url: "https://raw/writer/reference.md",
          url: "u2",
        },
        {
          name: "scripts",
          path: "writer/scripts",
          type: "dir",
          download_url: null,
          url: "https://api.github.com/repos/acme/skills/contents/writer/scripts?ref=main",
        },
      ]),
      "https://api.github.com/repos/acme/skills/contents/writer/scripts?ref=main": JSON.stringify([
        {
          name: "run.sh",
          path: "writer/scripts/run.sh",
          type: "file",
          download_url: "https://raw/writer/scripts/run.sh",
          url: "u3",
        },
      ]),
      "https://raw/writer/SKILL.md": SKILL,
      "https://raw/writer/reference.md": REF,
      "https://raw/writer/scripts/run.sh": SCRIPT,
    };
    const fetchImpl = vi.fn(async (url: string) => {
      const body = responses[url];
      if (body === undefined) return { ok: false, status: 404, text: async () => "" };
      return { ok: true, status: 200, text: async () => body };
    });

    const res = await resolveSkillSource("https://github.com/acme/skills/tree/main/writer", {
      fetchImpl,
    });
    const paths = res.files.map((f) => f.path).sort();
    expect(paths).toEqual(["SKILL.md", "reference.md", "scripts/run.sh"]);
    expect(res.files.find((f) => f.path === "SKILL.md")?.content).toBe(SKILL);
    expect(res.provenance.sourceType).toBe("github");
    expect(res.provenance.packageName).toBe("acme/skills");
    expect(res.provenance.sourceRef).toBe("acme/skills/writer@main");
    expect(res.provenance.originHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("errors when the folder has no SKILL.md", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/contents/")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify([
              {
                name: "README.md",
                path: "writer/README.md",
                type: "file",
                download_url: "https://raw/writer/README.md",
                url: "u",
              },
            ]),
        };
      }
      return { ok: true, status: 200, text: async () => "hi" };
    });
    await expect(
      resolveSkillSource("https://github.com/acme/skills/tree/main/writer", { fetchImpl }),
    ).rejects.toThrow(/no SKILL\.md/i);
  });
});

describe("resolveSkillSource — local-path scan", () => {
  let base: string;
  const prevBase = process.env.SKILL_IMPORT_LOCAL_BASE;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "skill-local-"));
    process.env.SKILL_IMPORT_LOCAL_BASE = base;
  });
  afterEach(() => {
    if (prevBase === undefined) delete process.env.SKILL_IMPORT_LOCAL_BASE;
    else process.env.SKILL_IMPORT_LOCAL_BASE = prevBase;
  });

  it("reads a SKILL bundle (SKILL.md + siblings) from disk under the allowed base", async () => {
    const dir = join(base, "writer");
    await mkdir(join(dir, "scripts"), { recursive: true });
    await writeFile(join(dir, "SKILL.md"), "---\nname: Writer\n---\n# Writer");
    await writeFile(join(dir, "reference.md"), "ref");
    await writeFile(join(dir, "scripts", "run.sh"), "#!/bin/sh");

    const res = await resolveSkillSource("local:writer");
    expect(res.files.map((f) => f.path).sort()).toEqual([
      "SKILL.md",
      "reference.md",
      "scripts/run.sh",
    ]);
    expect(res.provenance.sourceType).toBe("local_path");
    expect(res.provenance.packageName).toBeNull();
    expect(res.provenance.originHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts a path pointed straight at SKILL.md (parent is the bundle root)", async () => {
    const dir = join(base, "solo");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SKILL.md"), "---\nname: Solo\n---\n# Solo");
    const res = await resolveSkillSource("local:solo/SKILL.md");
    expect(res.files[0]?.path).toBe("SKILL.md");
  });

  it("rejects a traversal attempt that escapes the allowed base", async () => {
    await expect(resolveSkillSource("local:../outside")).rejects.toThrow(SkillSourceError);
    await expect(resolveSkillSource("local:writer/../../etc")).rejects.toThrow(/\.\.|escapes/i);
  });

  it("rejects a symlink that escapes the base via realpath containment", async () => {
    const outside = await mkdtemp(join(tmpdir(), "skill-outside-"));
    await writeFile(join(outside, "SKILL.md"), "---\nname: X\n---\n# X");
    const linkPath = join(base, "link");
    await symlink(outside, linkPath, "dir");
    await expect(resolveSkillSource("local:link")).rejects.toThrow(/escapes/i);
  });

  it("fails closed when the allowed base is not configured", async () => {
    delete process.env.SKILL_IMPORT_LOCAL_BASE;
    await expect(resolveSkillSource("local:writer")).rejects.toThrow(/disabled/i);
  });
});

describe("resolveSkillSource — skills.sh registry (mocked)", () => {
  it("resolves via a downloadUrl in the registry response", async () => {
    const SKILL = "---\nname: Find\n---\n# Find Skills";
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "https://skills.sh/api/skills/vercel-labs/skills/find-skills") {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              owner: "vercel-labs",
              repo: "skills",
              downloadUrl: "https://raw/find/SKILL.md",
            }),
        };
      }
      if (url === "https://raw/find/SKILL.md")
        return { ok: true, status: 200, text: async () => SKILL };
      return { ok: false, status: 404, text: async () => "" };
    });
    const res = await resolveSkillSource("skillsh:vercel-labs/skills/find-skills", { fetchImpl });
    expect(res.files).toEqual([{ path: "SKILL.md", content: SKILL }]);
    expect(res.provenance.sourceType).toBe("skills_sh");
    expect(res.provenance.packageName).toBe("vercel-labs/skills");
    expect(res.provenance.sourceRef).toBe("skillsh:vercel-labs/skills/find-skills");
  });

  it("resolves an owner/repo coordinate to a GitHub raw fetch", async () => {
    const SKILL = "---\nname: Design\n---\n# Design";
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith("https://skills.sh/api/skills/")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ owner: "acme", repo: "skills", ref: "main", path: "design" }),
        };
      }
      if (url === "https://raw.githubusercontent.com/acme/skills/main/design/SKILL.md") {
        return { ok: true, status: 200, text: async () => SKILL };
      }
      return { ok: false, status: 404, text: async () => "" };
    });
    const res = await resolveSkillSource("https://skills.sh/acme/skills/design", { fetchImpl });
    expect(res.files[0]?.content).toBe(SKILL);
    expect(res.provenance.sourceType).toBe("skills_sh");
    expect(res.provenance.sourceRef).toBe("https://skills.sh/acme/skills/design");
  });

  it("resolves an inline files[] bundle from the registry", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          owner: "acme",
          repo: "skills",
          files: [
            { path: "SKILL.md", content: "---\nname: Inline\n---\n# Inline" },
            { path: "scripts/x.sh", content: "#!/bin/sh" },
          ],
        }),
    }));
    const res = await resolveSkillSource("skillsh:acme/skills/inline", { fetchImpl });
    expect(res.files.map((f) => f.path).sort()).toEqual(["SKILL.md", "scripts/x.sh"]);
    expect(res.provenance.sourceType).toBe("skills_sh");
  });

  it("errors when the registry response has no usable bundle", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ name: "x" }),
    }));
    await expect(resolveSkillSource("skillsh:x", { fetchImpl })).rejects.toThrow(/no files/i);
  });
});
