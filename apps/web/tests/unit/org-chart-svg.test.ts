import { describe, it, expect } from "vitest";
import { renderOrgChartSvg } from "@agentcenter/utils";

describe("renderOrgChartSvg (Domain 14 #16)", () => {
  it("renders a valid standalone SVG with a card per agent and edges to reports", () => {
    const svg = renderOrgChartSvg([
      { id: "ceo", name: "Ada", role: "CEO", reportsToAgentId: null },
      { id: "cto", name: "Grace", role: "CTO", reportsToAgentId: "ceo" },
      { id: "eng", name: "Linus", role: "Engineer", reportsToAgentId: "cto" },
    ]);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
    expect(svg).toContain(">Ada<");
    expect(svg).toContain(">CTO<");
    // one connector path per non-root edge (2 edges for a 3-node chain)
    expect(svg.match(/class="edge"/g)?.length).toBe(2);
    expect(svg.match(/class="node"/g)?.length).toBe(3);
  });

  it("XML-escapes agent names so markup can't break out", () => {
    const svg = renderOrgChartSvg([
      { id: "a", name: 'Evil <script>&"', role: null, reportsToAgentId: null },
    ]);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
  });

  it("is deterministic (same input → identical output) and handles empty input", () => {
    const nodes = [{ id: "x", name: "Solo", role: null, reportsToAgentId: null }];
    expect(renderOrgChartSvg(nodes)).toBe(renderOrgChartSvg(nodes));
    const empty = renderOrgChartSvg([]);
    expect(empty.startsWith("<svg")).toBe(true);
    expect(empty).toContain("</svg>");
  });

  it("omits the stylesheet when styled:false", () => {
    const svg = renderOrgChartSvg([{ id: "a", name: "A", reportsToAgentId: null }], {
      styled: false,
    });
    expect(svg).not.toContain("<style>");
  });
});
