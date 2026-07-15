import { describe, it, expect } from "vitest";
import { computeOrgLayout } from "@agentcenter/utils";

describe("computeOrgLayout", () => {
  it("returns an empty layout for no agents", () => {
    const l = computeOrgLayout([]);
    expect(l.nodes).toEqual({});
    expect(l.edges).toEqual([]);
    expect(l.width).toBe(0);
    expect(l.height).toBe(0);
  });

  it("places children below the parent and centers the parent over them", () => {
    const l = computeOrgLayout(
      [
        { id: "ceo", reportsToAgentId: null },
        { id: "a", reportsToAgentId: "ceo" },
        { id: "b", reportsToAgentId: "ceo" },
      ],
      { nodeWidth: 100, nodeHeight: 50, hGap: 20, vGap: 50 },
    );
    // children at depth 1, columns 0 and 1 → x 0 and 120; ceo centered at x 60, depth 0
    expect(l.nodes.a).toMatchObject({ depth: 1, x: 0, y: 100 });
    expect(l.nodes.b).toMatchObject({ depth: 1, x: 120, y: 100 });
    expect(l.nodes.ceo).toMatchObject({ depth: 0, y: 0, x: 60 });
    expect(l.edges).toEqual(
      expect.arrayContaining([
        { from: "ceo", to: "a" },
        { from: "ceo", to: "b" },
      ]),
    );
    expect(l.edges).toHaveLength(2);
  });

  it("treats a dangling / self manager as a root", () => {
    const l = computeOrgLayout([
      { id: "x", reportsToAgentId: "ghost" }, // ghost not in set → root
      { id: "y", reportsToAgentId: "y" }, // self → root
    ]);
    expect(l.nodes.x.depth).toBe(0);
    expect(l.nodes.y.depth).toBe(0);
    expect(l.edges).toEqual([]);
  });

  it("breaks a cycle instead of looping forever", () => {
    const l = computeOrgLayout([
      { id: "a", reportsToAgentId: "b" },
      { id: "b", reportsToAgentId: "a" },
    ]);
    // both get positioned (one promoted to root); no infinite recursion
    expect(Object.keys(l.nodes).sort()).toEqual(["a", "b"]);
  });
});
