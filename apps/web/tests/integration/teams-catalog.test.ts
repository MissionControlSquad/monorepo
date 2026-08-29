import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { installTeamFromCatalog } from "../../src/server/services/teams";
import { listCatalogTeams } from "@agentcenter/teams-catalog";

// Domain 14: install-from-markdown — installing a shipped catalog team materializes a workspace Team
// (+ role members) and records the pinned, sha256-carrying sourceRef for provenance.
const WS = "ws_teams_catalog";

beforeEach(async () => {
  await prisma.teamMember.deleteMany({ where: { workspaceId: WS } });
  await prisma.team.deleteMany({ where: { workspaceId: WS } });
});

describe("installTeamFromCatalog (Domain 14)", () => {
  it("creates the team + one member per catalog role, with pinned provenance", async () => {
    const entry = listCatalogTeams().find((t) => t.slug === "engineering")!;
    const team = await installTeamFromCatalog({ workspaceId: WS, ref: "engineering" });

    expect(team.key).toBe("engineering");
    expect(team.sourceRef).toBe(entry.sourceRef);
    expect(team.sourceRef).toMatch(/#sha256:[0-9a-f]{64}$/);

    const members = await prisma.teamMember.findMany({ where: { teamId: team.id } });
    expect(members).toHaveLength(entry.roles.length);
    const names = new Set(members.map((m) => m.name));
    for (const role of entry.roles) expect(names.has(role.name)).toBe(true);
  });

  it("installs a curated cross-functional team by slug", async () => {
    const team = await installTeamFromCatalog({ workspaceId: WS, ref: "launch-squad" });
    const members = await prisma.teamMember.findMany({ where: { teamId: team.id } });
    expect(members.length).toBeGreaterThan(0);
  });

  it("rejects an unknown catalog ref", async () => {
    await expect(
      installTeamFromCatalog({ workspaceId: WS, ref: "does-not-exist" }),
    ).rejects.toThrow(/not found/);
  });
});
