import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  scoreCompany,
  searchCompanies,
  isCompanySearchRateLimited,
  createCompany,
} from "../../src/server/services/agent-companies";

// Parity #31–33 — company search (rank + extract + rate-limit).
const WS = "ws_cosearch";

describe("scoreCompany (pure ranker #31/#32)", () => {
  it("weights name > goals > description and reports matched fields", () => {
    const c = { name: "Acme Robotics", description: "builds robots", goals: ["ship robots"] };
    // 'robotics' hits name (3)
    expect(scoreCompany(c, ["robotics"])).toEqual({ score: 3, matchedFields: ["name"] });
    // 'robots' hits goals (2) + description (1)
    expect(scoreCompany(c, ["robots"])).toEqual({
      score: 3,
      matchedFields: ["goals", "description"],
    });
  });

  it("requires every term to match somewhere (AND semantics)", () => {
    const c = { name: "Acme", description: "d", goals: ["g"] };
    expect(scoreCompany(c, ["acme", "nope"]).score).toBe(0);
  });
});

describe("searchCompanies (#31)", () => {
  beforeEach(async () => {
    await prisma.agentCompany.deleteMany({ where: { workspaceId: WS } });
    await createCompany({ workspaceId: WS, name: "Acme Robotics", goals: ["ship robots"] });
    await createCompany({ workspaceId: WS, name: "Globex", description: "robots and rockets" });
    await createCompany({ workspaceId: WS, name: "Initech", description: "software" });
  });

  it("ranks matches (name hit outranks description hit) and excludes non-matches", async () => {
    const hits = await searchCompanies(WS, "robot");
    expect(hits.map((h) => h.company.name)).toEqual(["Acme Robotics", "Globex"]); // Acme (name,3) > Globex (desc,1)
    expect(hits[0].matchedFields).toContain("name");
    // Initech doesn't match
    expect(hits.find((h) => h.company.name === "Initech")).toBeUndefined();
  });

  it("returns [] for a blank query", async () => {
    expect(await searchCompanies(WS, "   ")).toEqual([]);
  });
});

describe("isCompanySearchRateLimited (#33)", () => {
  it("allows a burst then blocks past the window cap", () => {
    const ws = "ws_rl_" + Math.random().toString(36).slice(2);
    const t = 1_000_000;
    let blocked = 0;
    for (let i = 0; i < 40; i++) if (isCompanySearchRateLimited(ws, t)) blocked++;
    expect(blocked).toBe(10); // 30 allowed, next 10 blocked within the window
    // a later window resets
    expect(isCompanySearchRateLimited(ws, t + 61_000)).toBe(false);
  });
});
