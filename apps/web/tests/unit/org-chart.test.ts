import { describe, it, expect } from "vitest";
import { getAgentOrgChainHealth, buildOrgTree } from "@agentcenter/utils";
import { assertNoReportingCycle } from "@/server/services/org-chart";

// Epic #19: pure org-chain health + tree + cycle guard. Chain cases ported from Paperclip
// agent-eligibility (cycle + missing_manager modes).

const a = (id: string, reportsToAgentId: string | null = null) => ({
  id,
  name: id,
  reportsToAgentId,
});

describe("getAgentOrgChainHealth", () => {
  it("a chain that reaches a root is healthy", () => {
    // c → b → a(root)
    const agents = [a("a"), a("b", "a"), a("c", "b")];
    const h = getAgentOrgChainHealth("c", agents);
    expect(h.status).toBe("healthy");
    expect(h.reason).toBe("healthy");
    expect(h.chain).toEqual(["c", "b", "a"]);
  });

  it("detects a cycle in the reporting chain", () => {
    // a → b → a  (a reports to b, b reports to a)
    const agents = [a("a", "b"), a("b", "a")];
    const h = getAgentOrgChainHealth("a", agents);
    expect(h.status).toBe("invalid_org_chain");
    expect(h.reason).toBe("cycle");
    expect(h.invalidAncestorId).toBe("a");
  });

  it("detects a missing manager", () => {
    // b reports to a manager not present in the set
    const agents = [a("b", "ghost")];
    const h = getAgentOrgChainHealth("b", agents);
    expect(h.status).toBe("invalid_org_chain");
    expect(h.reason).toBe("missing_manager");
    expect(h.invalidAncestorId).toBe("ghost");
  });
});

describe("assertNoReportingCycle", () => {
  const agents = [a("a"), a("b", "a"), a("c", "b")]; // c→b→a

  it("allows a valid manager assignment", () => {
    expect(() => assertNoReportingCycle(agents, "c", "a")).not.toThrow();
  });
  it("allows clearing the manager", () => {
    expect(() => assertNoReportingCycle(agents, "b", null)).not.toThrow();
  });
  it("rejects self-management", () => {
    expect(() => assertNoReportingCycle(agents, "b", "b")).toThrow(/report to itself/);
  });
  it("rejects reporting to one's own report (cycle)", () => {
    // make a report to c, but c descends from a → cycle
    expect(() => assertNoReportingCycle(agents, "a", "c")).toThrow(/cycle/);
  });
});

describe("buildOrgTree", () => {
  const flat = [
    { id: "ceo", name: "CEO", role: "ceo", status: "active", reportsToAgentId: null },
    { id: "eng", name: "Eng", role: "engineer", status: "active", reportsToAgentId: "ceo" },
    { id: "jr", name: "Jr", role: "engineer", status: "idle", reportsToAgentId: "eng" },
  ];

  it("nests reports under managers with a single root", () => {
    const roots = buildOrgTree(flat);
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe("ceo");
    expect(roots[0].reports[0].id).toBe("eng");
    expect(roots[0].reports[0].reports[0].id).toBe("jr");
  });

  it("re-roots an orphan whose manager is absent", () => {
    const orphan = [{ id: "x", name: "X", role: "r", status: "idle", reportsToAgentId: "gone" }];
    const roots = buildOrgTree(orphan);
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe("x");
  });
});
