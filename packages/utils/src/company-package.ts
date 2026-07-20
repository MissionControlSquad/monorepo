/**
 * Agent-Companies markdown package (Domain 14 #11/#12) — pure, shared via @agentcenter/utils. Emits
 * and parses the `COMPANY.md` / `AGENTS.md` files of the Paperclip agentcompanies/v1 portable format
 * (YAML-ish frontmatter + markdown body), and renders a Mermaid org chart for the export README. No
 * I/O; the service reads the DB entities and assembles the file map.
 */
import { parseSkillFrontmatter } from "./skill-frontmatter";

export interface CompanyPackageFields {
  name: string;
  slug: string;
  description?: string | null;
  goals?: string[];
  license?: string | null;
  schemaVersion?: string;
}

export interface AgentPackageFields {
  name: string;
  role: string;
  slug: string;
  reportsTo?: string | null; // manager slug
  personality?: string | null;
}

function yamlValue(v: string | null | undefined): string {
  const s = (v ?? "").replace(/"/g, '\\"');
  return `"${s}"`;
}
function yamlList(items: string[] | undefined): string {
  if (!items || items.length === 0) return "[]";
  return `[${items.map((i) => yamlValue(i)).join(", ")}]`;
}

/** Pure: emit a COMPANY.md string (frontmatter + goals section). */
export function emitCompanyMarkdown(company: CompanyPackageFields): string {
  const fm = [
    "---",
    `schema: ${company.schemaVersion ?? "agentcompanies/v1"}`,
    `name: ${yamlValue(company.name)}`,
    `slug: ${yamlValue(company.slug)}`,
    ...(company.description ? [`description: ${yamlValue(company.description)}`] : []),
    ...(company.license ? [`license: ${yamlValue(company.license)}`] : []),
    `goals: ${yamlList(company.goals)}`,
    "---",
  ].join("\n");
  const body = [
    `# ${company.name}`,
    "",
    company.description ?? "",
    "",
    ...(company.goals && company.goals.length
      ? ["## Goals", "", ...company.goals.map((g) => `- ${g}`)]
      : []),
    "",
  ].join("\n");
  return `${fm}\n${body}`;
}

/** Pure: parse a COMPANY.md back into fields (frontmatter-driven). Missing frontmatter → null. */
export function parseCompanyMarkdown(markdown: string): CompanyPackageFields | null {
  const fm = parseSkillFrontmatter(markdown);
  if (!fm || typeof fm.name !== "string") return null;
  return {
    name: fm.name,
    slug: typeof fm.slug === "string" ? fm.slug : "",
    description: typeof fm.description === "string" ? fm.description : null,
    license: typeof fm.license === "string" ? fm.license : null,
    goals: Array.isArray(fm.goals) ? fm.goals : [],
    schemaVersion: typeof fm.schema === "string" ? fm.schema : "agentcompanies/v1",
  };
}

/** Pure: emit an AGENTS.md for one agent (frontmatter + persona body). */
export function emitAgentMarkdown(agent: AgentPackageFields): string {
  const fm = [
    "---",
    `name: ${yamlValue(agent.name)}`,
    `slug: ${yamlValue(agent.slug)}`,
    `role: ${yamlValue(agent.role)}`,
    ...(agent.reportsTo ? [`reportsTo: ${yamlValue(agent.reportsTo)}`] : []),
    "---",
  ].join("\n");
  const body = [`# ${agent.name}`, "", `Role: ${agent.role}`, "", agent.personality ?? "", ""].join(
    "\n",
  );
  return `${fm}\n${body}`;
}

/** Pure: render a Mermaid `graph TD` of the reporting hierarchy, for the export README. */
export function renderOrgChartMermaid(
  agents: { slug: string; name: string; reportsTo?: string | null }[],
): string {
  const nodeId = (slug: string) => `n_${slug.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const lines = ["```mermaid", "graph TD"];
  for (const a of agents) lines.push(`  ${nodeId(a.slug)}["${a.name}"]`);
  for (const a of agents) {
    if (a.reportsTo) lines.push(`  ${nodeId(a.reportsTo)} --> ${nodeId(a.slug)}`);
  }
  lines.push("```");
  return lines.join("\n");
}
