/**
 * Agent instruction bundles (Epic #18) — shared defaults + validation. Import from @agentcenter/utils.
 * Pure — the web service does persistence.
 */
export const AGENT_INSTRUCTION_DEFAULT_BUNDLE = ["AGENTS.md"];
export const AGENT_INSTRUCTION_CEO_BUNDLE = ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"];

export const DEFAULT_AGENTS_MD =
  "# AGENTS.md\n\n" +
  "## Role\nDescribe what this agent is responsible for.\n\n" +
  "## Guidelines\n- Be concise and act autonomously within your remit.\n- Ask for approval before " +
  "irreversible or costly actions.\n\n## Tools\nList the tools and skills this agent should use.\n";

/** Pure: which default files an agent of this role/level should start with. */
export function defaultBundleFor(role: string | null | undefined): string[] {
  const r = (role ?? "").toLowerCase();
  return r.includes("ceo") || r.includes("chief")
    ? [...AGENT_INSTRUCTION_CEO_BUNDLE]
    : [...AGENT_INSTRUCTION_DEFAULT_BUNDLE];
}

const MAX_FILENAME = 64;

/** Pure: a safe instruction file name — a plain `*.md` basename, no path separators or traversal. */
export function isValidInstructionFileName(name: string): boolean {
  if (!name || name.length > MAX_FILENAME) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name.includes("..")) return false;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return false;
  return name.toLowerCase().endsWith(".md");
}
