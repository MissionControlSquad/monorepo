/**
 * Agent-Companies markdown package (Domain 14 #11/#12) — pure, shared via @agentcenter/utils. Emits
 * and parses the multi-kind files of the Paperclip agentcompanies/v1 portable format (YAML-ish
 * frontmatter + markdown body): `COMPANY.md`, `AGENTS.md`, and — added here — `TEAM.md` / `PROJECT.md`
 * / `TASK.md` / `SKILL.md`. Also renders a Mermaid org chart for the export README. No I/O; the service
 * reads the DB entities and assembles the file map.
 *
 * Round-trip contract: every kind's canonical emit is a fixed point of parse — `emit(parse(emit(x)))`
 * is byte-identical to `emit(x)`. All emitted data lives in frontmatter (a pure function of the fields)
 * except two cases the parser reads back verbatim: a TEAM.md's `## Roles` list and a SKILL.md's body.
 */
import { parseSkillFrontmatter, splitFrontmatter } from "./skill-frontmatter";

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

// ─── Additional package kinds (TEAM / PROJECT / TASK / SKILL) ────────────────
// A team is a named group of agent roles; project/task capture work items; skill mirrors the
// SKILL.md contract. Each carries `kind:` in its agentcompanies/v1 frontmatter so a mixed package is
// self-describing.

export interface TeamRole {
  name: string;
  role: string;
}

export interface TeamPackageFields {
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  tagline?: string | null;
  author?: string | null;
  tags?: string[];
  members: TeamRole[];
  sourceRef?: string | null;
  schemaVersion?: string;
}

export interface ProjectPackageFields {
  name: string;
  slug: string;
  description?: string | null;
  status?: string | null;
  goals?: string[];
  sourceRef?: string | null;
  schemaVersion?: string;
}

export interface TaskPackageFields {
  title: string;
  slug: string;
  status?: string | null;
  assignee?: string | null; // agent slug
  description?: string | null;
  sourceRef?: string | null;
  schemaVersion?: string;
}

export interface SkillPackageFields {
  name: string;
  slug: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
  /** The SKILL.md markdown body (instructions), preserved verbatim for a byte-stable round-trip. */
  body?: string;
  sourceRef?: string | null;
  schemaVersion?: string;
}

/** Pure: emit a TEAM.md (frontmatter + a `## Roles` list the parser reads back verbatim). */
export function emitTeamMarkdown(team: TeamPackageFields): string {
  const fm = [
    "---",
    `schema: ${team.schemaVersion ?? "agentcompanies/v1"}`,
    "kind: team",
    `name: ${yamlValue(team.name)}`,
    `slug: ${yamlValue(team.slug)}`,
    ...(team.description ? [`description: ${yamlValue(team.description)}`] : []),
    ...(team.icon ? [`icon: ${yamlValue(team.icon)}`] : []),
    ...(team.tagline ? [`tagline: ${yamlValue(team.tagline)}`] : []),
    ...(team.author ? [`author: ${yamlValue(team.author)}`] : []),
    `tags: ${yamlList(team.tags)}`,
    ...(team.sourceRef ? [`sourceRef: ${yamlValue(team.sourceRef)}`] : []),
    "---",
  ].join("\n");
  const body = [
    `# ${team.name}`,
    "",
    team.description ?? team.tagline ?? "",
    "",
    "## Roles",
    "",
    ...team.members.map((m) => `- ${m.name} — ${m.role}`),
    "",
  ].join("\n");
  return `${fm}\n${body}`;
}

/** Pure: parse a TEAM.md back into fields. Members come from the `- name — role` lines under Roles. */
export function parseTeamMarkdown(markdown: string): TeamPackageFields | null {
  const fm = parseSkillFrontmatter(markdown);
  if (!fm || typeof fm.name !== "string") return null;
  const { body } = splitFrontmatter(markdown);
  const members: TeamRole[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = /^-[ \t]+(.+?)[ \t]+—[ \t]+(.+)$/.exec(line.trim());
    if (m) members.push({ name: m[1].trim(), role: m[2].trim() });
  }
  return {
    name: fm.name,
    slug: typeof fm.slug === "string" ? fm.slug : "",
    description: typeof fm.description === "string" ? fm.description : null,
    icon: typeof fm.icon === "string" ? fm.icon : null,
    tagline: typeof fm.tagline === "string" ? fm.tagline : null,
    author: typeof fm.author === "string" ? fm.author : null,
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    members,
    sourceRef: typeof fm.sourceRef === "string" ? fm.sourceRef : null,
    schemaVersion: typeof fm.schema === "string" ? fm.schema : "agentcompanies/v1",
  };
}

/** Pure: emit a PROJECT.md (frontmatter + goals section, mirroring COMPANY.md's shape). */
export function emitProjectMarkdown(project: ProjectPackageFields): string {
  const fm = [
    "---",
    `schema: ${project.schemaVersion ?? "agentcompanies/v1"}`,
    "kind: project",
    `name: ${yamlValue(project.name)}`,
    `slug: ${yamlValue(project.slug)}`,
    ...(project.description ? [`description: ${yamlValue(project.description)}`] : []),
    ...(project.status ? [`status: ${yamlValue(project.status)}`] : []),
    `goals: ${yamlList(project.goals)}`,
    ...(project.sourceRef ? [`sourceRef: ${yamlValue(project.sourceRef)}`] : []),
    "---",
  ].join("\n");
  const body = [
    `# ${project.name}`,
    "",
    project.description ?? "",
    "",
    ...(project.goals && project.goals.length
      ? ["## Goals", "", ...project.goals.map((g) => `- ${g}`)]
      : []),
    "",
  ].join("\n");
  return `${fm}\n${body}`;
}

/** Pure: parse a PROJECT.md back into fields (frontmatter-driven). */
export function parseProjectMarkdown(markdown: string): ProjectPackageFields | null {
  const fm = parseSkillFrontmatter(markdown);
  if (!fm || typeof fm.name !== "string") return null;
  return {
    name: fm.name,
    slug: typeof fm.slug === "string" ? fm.slug : "",
    description: typeof fm.description === "string" ? fm.description : null,
    status: typeof fm.status === "string" ? fm.status : null,
    goals: Array.isArray(fm.goals) ? fm.goals : [],
    sourceRef: typeof fm.sourceRef === "string" ? fm.sourceRef : null,
    schemaVersion: typeof fm.schema === "string" ? fm.schema : "agentcompanies/v1",
  };
}

/** Pure: emit a TASK.md (all fields in frontmatter; body is title + description). */
export function emitTaskMarkdown(task: TaskPackageFields): string {
  const fm = [
    "---",
    `schema: ${task.schemaVersion ?? "agentcompanies/v1"}`,
    "kind: task",
    `title: ${yamlValue(task.title)}`,
    `slug: ${yamlValue(task.slug)}`,
    ...(task.status ? [`status: ${yamlValue(task.status)}`] : []),
    ...(task.assignee ? [`assignee: ${yamlValue(task.assignee)}`] : []),
    ...(task.description ? [`description: ${yamlValue(task.description)}`] : []),
    ...(task.sourceRef ? [`sourceRef: ${yamlValue(task.sourceRef)}`] : []),
    "---",
  ].join("\n");
  const body = [`# ${task.title}`, "", task.description ?? "", ""].join("\n");
  return `${fm}\n${body}`;
}

/** Pure: parse a TASK.md back into fields (frontmatter-driven). */
export function parseTaskMarkdown(markdown: string): TaskPackageFields | null {
  const fm = parseSkillFrontmatter(markdown);
  if (!fm || typeof fm.title !== "string") return null;
  return {
    title: fm.title,
    slug: typeof fm.slug === "string" ? fm.slug : "",
    status: typeof fm.status === "string" ? fm.status : null,
    assignee: typeof fm.assignee === "string" ? fm.assignee : null,
    description: typeof fm.description === "string" ? fm.description : null,
    sourceRef: typeof fm.sourceRef === "string" ? fm.sourceRef : null,
    schemaVersion: typeof fm.schema === "string" ? fm.schema : "agentcompanies/v1",
  };
}

/** Pure: emit a SKILL.md (frontmatter + verbatim body). Round-trips byte-stably including the body. */
export function emitSkillMarkdown(skill: SkillPackageFields): string {
  const fm = [
    "---",
    `schema: ${skill.schemaVersion ?? "agentcompanies/v1"}`,
    "kind: skill",
    `name: ${yamlValue(skill.name)}`,
    `slug: ${yamlValue(skill.slug)}`,
    ...(skill.description ? [`description: ${yamlValue(skill.description)}`] : []),
    ...(skill.category ? [`category: ${yamlValue(skill.category)}`] : []),
    `tags: ${yamlList(skill.tags)}`,
    ...(skill.sourceRef ? [`sourceRef: ${yamlValue(skill.sourceRef)}`] : []),
    "---",
  ].join("\n");
  const body = skill.body ?? `# ${skill.name}\n`;
  return `${fm}\n${body}`;
}

/** Pure: parse a SKILL.md package file back into fields, preserving the body verbatim. */
export function parseSkillPackageMarkdown(markdown: string): SkillPackageFields | null {
  const fm = parseSkillFrontmatter(markdown);
  if (!fm || typeof fm.name !== "string") return null;
  const { body } = splitFrontmatter(markdown);
  return {
    name: fm.name,
    slug: typeof fm.slug === "string" ? fm.slug : "",
    description: typeof fm.description === "string" ? fm.description : null,
    category: typeof fm.category === "string" ? fm.category : null,
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    body,
    sourceRef: typeof fm.sourceRef === "string" ? fm.sourceRef : null,
    schemaVersion: typeof fm.schema === "string" ? fm.schema : "agentcompanies/v1",
  };
}

export interface ParsedCompanyPackage {
  company: CompanyPackageFields | null;
  agents: AgentPackageFields[];
  teams: TeamPackageFields[];
  projects: ProjectPackageFields[];
  tasks: TaskPackageFields[];
  skills: SkillPackageFields[];
  warnings: string[];
}

/** Pure: parse an AGENTS.md file back into fields (frontmatter-driven). Missing name → null. */
export function parseAgentMarkdown(markdown: string): AgentPackageFields | null {
  const fm = parseSkillFrontmatter(markdown);
  if (!fm || typeof fm.name !== "string") return null;
  return {
    name: fm.name,
    slug: typeof fm.slug === "string" ? fm.slug : "",
    role: typeof fm.role === "string" ? fm.role : "worker",
    reportsTo: typeof fm.reportsTo === "string" ? fm.reportsTo : null,
  };
}

/**
 * Pure: parse a whole company package file map (path→content) into a structured import plan. Reads
 * COMPANY.md for the company and every agents/<slug>/AGENTS.md for members. Collects warnings for a
 * missing/invalid COMPANY.md or an unparseable AGENTS.md. Path-unsafe entries are skipped with a warning.
 */
export function parseCompanyPackageFiles(
  files: { path: string; content: string }[],
): ParsedCompanyPackage {
  const warnings: string[] = [];
  let company: CompanyPackageFields | null = null;
  const agents: AgentPackageFields[] = [];
  const teams: TeamPackageFields[] = [];
  const projects: ProjectPackageFields[] = [];
  const tasks: TaskPackageFields[] = [];
  const skills: SkillPackageFields[] = [];

  for (const f of files) {
    const path = f.path.trim();
    if (/(^\/|\.\.(?:\/|\\|$)|^[a-zA-Z]:)/.test(path)) {
      warnings.push(`skipped unsafe path: ${path}`);
      continue;
    }
    if (path === "COMPANY.md") {
      company = parseCompanyMarkdown(f.content);
      if (!company) warnings.push("COMPANY.md is missing or has no frontmatter");
    } else if (/(^|\/)AGENTS\.md$/i.test(path)) {
      const a = parseAgentMarkdown(f.content);
      if (a) agents.push(a);
      else warnings.push(`could not parse ${path}`);
    } else if (/(^|\/)TEAM\.md$/i.test(path)) {
      const t = parseTeamMarkdown(f.content);
      if (t) teams.push(t);
      else warnings.push(`could not parse ${path}`);
    } else if (/(^|\/)PROJECT\.md$/i.test(path)) {
      const p = parseProjectMarkdown(f.content);
      if (p) projects.push(p);
      else warnings.push(`could not parse ${path}`);
    } else if (/(^|\/)TASK\.md$/i.test(path)) {
      const tk = parseTaskMarkdown(f.content);
      if (tk) tasks.push(tk);
      else warnings.push(`could not parse ${path}`);
    } else if (/(^|\/)SKILL\.md$/i.test(path)) {
      const sk = parseSkillPackageMarkdown(f.content);
      if (sk) skills.push(sk);
      else warnings.push(`could not parse ${path}`);
    }
  }
  if (!company) warnings.push("package has no valid COMPANY.md");
  return { company, agents, teams, projects, tasks, skills, warnings };
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
