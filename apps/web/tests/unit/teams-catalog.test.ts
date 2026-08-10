import { describe, it, expect } from "vitest";
import { listCatalogTeams, getCatalogTeam, teamsCatalog } from "@agentcenter/teams-catalog";
import { hashPackageFiles, parseSourceRef, verifyPackageIntegrity } from "@agentcenter/utils";
import { AGENT_TEMPLATES } from "@/server/agent-templates";

// Domain 14: the shipped markdown teams catalog — migration completeness + content-addressed integrity.

describe("teams catalog — build/load", () => {
  it("loads the generated manifest with teams + provenance", () => {
    const teams = listCatalogTeams();
    expect(teams.length).toBeGreaterThan(0);
    expect(teamsCatalog.packageName).toBe("@agentcenter/teams-catalog");
    // sorted by id, resolvable by slug/key/id
    expect(getCatalogTeam("engineering")?.slug).toBe("engineering");
    expect(getCatalogTeam("team_engineering")?.slug).toBe("engineering");
  });

  it("ships the curated cross-functional teams", () => {
    expect(getCatalogTeam("launch-squad")).not.toBeNull();
    expect(getCatalogTeam("growth-pod")).not.toBeNull();
  });
});

describe("migrate-completeness — no shipped team is lost", () => {
  const categories: string[] = [...new Set(AGENT_TEMPLATES.map((t) => String(t.category)))];

  it("every AGENT_TEMPLATES category is present as a TEAM.md", () => {
    for (const category of categories) {
      const team = getCatalogTeam(category);
      expect(team, `category "${category}" must be a catalog team`).not.toBeNull();
      expect(team!.slug).toBe(category);
    }
  });

  it("every shipped agent template appears as a role in its category team", () => {
    for (const tmpl of AGENT_TEMPLATES) {
      const team = getCatalogTeam(tmpl.category)!;
      const found = team.roles.some((r) => r.name === tmpl.name);
      expect(found, `template "${tmpl.name}" (${tmpl.category}) must be a role in its team`).toBe(
        true,
      );
    }
  });

  it("the catalog covers every category exactly once + the 2 curated teams", () => {
    const categoryTeams = listCatalogTeams().filter((t) => categories.includes(t.slug));
    expect(categoryTeams).toHaveLength(categories.length);
    expect(listCatalogTeams()).toHaveLength(categories.length + 2);
  });
});

describe("content-addressed integrity", () => {
  it("each team's contentHash matches a recompute + its pinned sourceRef sha256", () => {
    for (const team of listCatalogTeams()) {
      const recomputed = hashPackageFiles(
        team.files.map((f) => ({ path: f.path, content: f.content })),
      );
      expect(recomputed, `${team.slug} contentHash`).toBe(team.contentHash);
      const ref = parseSourceRef(team.sourceRef);
      expect(ref, `${team.slug} sourceRef parses`).not.toBeNull();
      expect(ref!.sha256).toBe(team.contentHash);
      expect(verifyPackageIntegrity(team.files, team.sourceRef).ok).toBe(true);
    }
  });

  it("a tampered catalog file fails the sha256 integrity check", () => {
    const team = getCatalogTeam("engineering")!;
    const tampered = team.files.map((f) =>
      /TEAM\.md$/.test(f.path) ? { ...f, content: f.content + "\nEVIL" } : f,
    );
    expect(verifyPackageIntegrity(tampered, team.sourceRef).ok).toBe(false);
  });
});
