import { describe, it, expect } from "vitest";
import {
  emitCompanyMarkdown,
  parseCompanyMarkdown,
  emitAgentMarkdown,
  renderOrgChartMermaid,
} from "@agentcenter/utils";

describe("company package emit/parse (Domain 14 #11/#12)", () => {
  it("emits COMPANY.md with agentcompanies/v1 frontmatter + goals, and round-trips", () => {
    const md = emitCompanyMarkdown({
      name: "Acme AI",
      slug: "acme-ai",
      description: "We build things",
      goals: ["Ship v1", "Grow"],
      license: "MIT",
    });
    expect(md).toContain("schema: agentcompanies/v1");
    expect(md).toContain('name: "Acme AI"');
    expect(md).toContain("- Ship v1");

    const parsed = parseCompanyMarkdown(md);
    expect(parsed).toMatchObject({
      name: "Acme AI",
      slug: "acme-ai",
      description: "We build things",
      license: "MIT",
      goals: ["Ship v1", "Grow"],
      schemaVersion: "agentcompanies/v1",
    });
  });

  it("returns null parsing markdown without frontmatter", () => {
    expect(parseCompanyMarkdown("# Just a heading")).toBeNull();
  });

  it("emits an AGENTS.md with role + reportsTo", () => {
    const md = emitAgentMarkdown({ name: "Grace", slug: "grace", role: "cto", reportsTo: "ada" });
    expect(md).toContain('role: "cto"');
    expect(md).toContain('reportsTo: "ada"');
    expect(md).toContain("# Grace");
  });

  it("renders a Mermaid org chart with nodes + reporting edges", () => {
    const mermaid = renderOrgChartMermaid([
      { slug: "ada", name: "Ada", reportsTo: null },
      { slug: "grace", name: "Grace", reportsTo: "ada" },
    ]);
    expect(mermaid).toContain("```mermaid");
    expect(mermaid).toContain("graph TD");
    expect(mermaid).toContain('n_ada["Ada"]');
    expect(mermaid).toContain("n_ada --> n_grace");
  });
});
