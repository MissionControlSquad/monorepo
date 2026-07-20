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

describe("parseCompanyPackageFiles (Domain 14 #12 import)", () => {
  it("parses a COMPANY.md + AGENTS.md file map into an import plan", async () => {
    const { parseCompanyPackageFiles, emitCompanyMarkdown, emitAgentMarkdown } =
      await import("@agentcenter/utils");
    const files = [
      {
        path: "COMPANY.md",
        content: emitCompanyMarkdown({ name: "Acme", slug: "acme", goals: ["g"] }),
      },
      {
        path: "agents/ada/AGENTS.md",
        content: emitAgentMarkdown({ name: "Ada", slug: "ada", role: "ceo" }),
      },
      {
        path: "agents/grace/AGENTS.md",
        content: emitAgentMarkdown({ name: "Grace", slug: "grace", role: "cto", reportsTo: "ada" }),
      },
      { path: "README.md", content: "ignored" },
    ];
    const plan = parseCompanyPackageFiles(files);
    expect(plan.company).toMatchObject({ name: "Acme", slug: "acme", goals: ["g"] });
    expect(plan.agents).toHaveLength(2);
    expect(plan.agents.find((a) => a.slug === "grace")?.reportsTo).toBe("ada");
    expect(plan.warnings).toEqual([]);
  });

  it("warns on a missing COMPANY.md and skips unsafe paths", async () => {
    const { parseCompanyPackageFiles } = await import("@agentcenter/utils");
    const plan = parseCompanyPackageFiles([
      { path: "../escape/AGENTS.md", content: "x" },
      { path: "notes.txt", content: "y" },
    ]);
    expect(plan.company).toBeNull();
    expect(plan.warnings.some((w) => /no valid COMPANY.md/.test(w))).toBe(true);
    expect(plan.warnings.some((w) => /unsafe path/.test(w))).toBe(true);
  });
});
