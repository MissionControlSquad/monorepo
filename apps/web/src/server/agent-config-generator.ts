import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { env } from "./env";
import { CURRENT_CONFIG_VERSION } from "./config-version";
import { AgentLevel } from "./constants";
import { getAgentSlug } from "@agentcenter/utils";

const AGENT_TEMPLATES_DIR = join(process.cwd(), "src", "server", "agent-templates");
const TEMPLATES_DIR = join(AGENT_TEMPLATES_DIR, "configs");
const BOOTSTRAP_MSG_DIR = join(AGENT_TEMPLATES_DIR, "bootstrap-message");
const SKILLS_DIR = join(AGENT_TEMPLATES_DIR, "skills");

interface AgentInfo {
  id: string;
  name: string;
  role: string;
  username: string;
  identityEmoji: string;
  personality: string;
  level: string;
  capabilities?: string[];
  templateId?: string;
}

interface ConfigFile {
  filename: string;
  content: string;
}

/** Read a template file and interpolate {{variables}} */
function renderTemplate(templatePath: string, vars: Record<string, string>): string {
  let raw: string;
  try {
    raw = readFileSync(templatePath, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Agent template missing or unreadable: ${templatePath} — ${msg}`);
  }
  return raw.replace(/\{\{(\w[\w.]*)\}\}/g, (match, key) => {
    if (vars[key] === undefined) {
      console.warn(`[agent-config] Missing template variable: ${key} in ${templatePath}`);
    }
    return vars[key] ?? match;
  });
}

/** Build the variable map from agent info + context */
function buildVars(agent: AgentInfo, mcUrl: string, apiKey: string): Record<string, string> {
  return {
    "agent.name": agent.name,
    "agent.role": agent.role,
    "agent.username": agent.username,
    "agent.identityEmoji": agent.identityEmoji,
    "agent.level": agent.level,
    "agent.id": agent.id,
    "agent.personality": agent.personality || "No specific personality configured.",
    "agent.personalityFirstSentence": agent.personality
      ? agent.personality.split(".")[0] + "."
      : "Professional and capable.",
    capabilities: agent.capabilities?.length
      ? agent.capabilities.map((c) => `- ${c}`).join("\n")
      : "- General tasks",
    mcUrl,
    apiKey,
    configVersion: CURRENT_CONFIG_VERSION,
  };
}

/** Determine which role folder to use */
function getRoleDir(level: string): string {
  return level === AgentLevel.LEAD ? "lead" : "worker";
}

/**
 * Generate SKILL.md from a template file in agent-templates/skills/{templateId}.md.
 * Falls back to a generic skill file if no template exists.
 */
/** Only allow safe template ids (alphanumeric + hyphen) to avoid path traversal */
const SAFE_TEMPLATE_ID = /^[a-z0-9-]+$/i;

function generateSkillFile(agent: AgentInfo, vars: Record<string, string>): string {
  if (agent.templateId && SAFE_TEMPLATE_ID.test(agent.templateId)) {
    const skillPath = join(SKILLS_DIR, `${agent.templateId}.md`);
    if (existsSync(skillPath)) {
      return renderTemplate(skillPath, vars);
    }
  }

  // Fallback for blank/custom templates
  return `# SKILL.md — ${agent.role} Guide

How ${agent.name} works. This is your craft — the standards and methodology for your role.

## Your Capabilities
${vars.capabilities}

## How You Work (Non-Negotiable)
- **Read before you write.** Always read the task description, parent task, upstream deliverables, and messages _before_ you start working. Context first, action second.
- **Don't work on blocked tasks.** If \`blockedByTaskId\` is set and that task isn't done, pick a different task.
- **Ask for clarification, don't guess.** Post a question on the task and move on. A quick question now saves a rejection later.
- **Reference related work.** When your task builds on another task's output, say so in your deliverable.
- **Unblock others first.** If your task is blocking a teammate, prioritize it.
- **Self-review before submitting.** Check against every acceptance criterion. Would _you_ approve this?
- **Flag scope creep.** If a task is bigger than described, say so. Don't silently absorb extra work.
- **Raise risks early.** Flag risky approaches, missing dependencies, or conflicts immediately.
- **Ship when it's done, not when it's perfect.** Meets acceptance criteria? Submit it.
- **Learn from rejections.** Read feedback carefully. Update MEMORY.md so you don't repeat mistakes.

## Teamwork
- **React to teammates' work.** Thumbs-up, heart, party — costs nothing, builds trust.
- **Check for existing work.** Read deliverables on related tasks before building something new.
- **Proactive updates.** If taking longer than expected, post a message before the deadline.

## Task Sizing
- **S** — completable in <1 heartbeat cycle
- **M** — 1-2 heartbeat cycles
- **L** — 3-5 heartbeat cycles
- **XL** — needs further decomposition before starting

## Review Standards
Before submitting, verify by deliverable type:
- **Code:** Compiles/passes tests? Matches acceptance criteria? Security concerns? Follows existing patterns?
- **Content:** Grammar, metadata, link validity, tone matches audience, facts sourced
- **Design:** UI consistency, responsiveness, accessibility (contrast, keyboard nav), all states covered (default, hover, error, empty, loading)
- **Research:** Source credibility, methodology transparency, actionability, bias check

## Before Submitting
- [ ] Deliverable matches the task requirements
- [ ] Self-reviewed against every acceptance criterion
- [ ] Key decisions documented with rationale
- [ ] Handoff message drafted (what you did, what you didn't, what's next)

---

_This file is yours to evolve. As you learn what works, update it._
`;
}

/**
 * Generate all config files needed for a new agent workspace.
 * Produces the 8 standard OpenClaw workspace files.
 * When apiKey is provided, it is embedded directly into the files (ready-to-use).
 * When omitted, files use $API_KEY placeholder.
 */
export function generateAgentConfig(
  agent: AgentInfo,
  mcUrl: string,
  _cronSchedule?: string,
  apiKey?: string,
): ConfigFile[] {
  const key = apiKey || "$API_KEY";
  const vars = buildVars(agent, mcUrl, key);
  const roleDir = getRoleDir(agent.level);

  const roleFiles = ["AGENTS.md", "HEARTBEAT.md", "BOOTSTRAP.md"];
  const leadOnlyFiles = roleDir === "lead" ? ["PLAYBOOK-LEAD.md"] : [];
  const sharedFiles = ["IDENTITY.md", "SOUL.md", "MEMORY.md", "TOOLS.md", "USER.md", "PLAYBOOK.md"];

  return [
    ...roleFiles.map((f) => ({
      filename: f,
      content: renderTemplate(join(TEMPLATES_DIR, roleDir, f), vars),
    })),
    ...leadOnlyFiles.map((f) => ({
      filename: f,
      content: renderTemplate(join(TEMPLATES_DIR, "lead", f), vars),
    })),
    ...sharedFiles.map((f) => ({
      filename: f,
      content: renderTemplate(join(TEMPLATES_DIR, "shared", f), vars),
    })),
    { filename: "SKILL.md", content: generateSkillFile(agent, vars) },
  ];
}

interface BootstrapContext {
  workspacePath: string;
  cronCommand: string;
  configFiles: ConfigFile[];
  openclawAgentConfig: { id: string; name: string; workspace: string };
}

/**
 * Generate a single bootstrap message for "auto mode".
 * The user pastes this into their connected channel (WhatsApp, Slack, Discord, etc.)
 * and the AI reads it to understand the full setup task and execute it.
 */
export function generateBootstrapMessage(
  agent: AgentInfo,
  mcUrl: string,
  apiKey: string,
  context: BootstrapContext,
): string {
  const vars = buildVars(agent, mcUrl, apiKey);

  vars.workspacePath = context.workspacePath;
  vars.cronCommand = context.cronCommand;
  vars.openclawConfigJson = JSON.stringify(context.openclawAgentConfig, null, 2);
  vars.configFilesSection = context.configFiles
    .map(
      (f) =>
        `### ${f.filename}\n\nSave this to \`${context.workspacePath}/${f.filename}\`:\n\n\`\`\`markdown\n${f.content}\n\`\`\``,
    )
    .join("\n\n");
  vars["openclawAgentConfig.id"] = context.openclawAgentConfig.id;

  const roleDir = getRoleDir(agent.level);
  return renderTemplate(join(BOOTSTRAP_MSG_DIR, `${roleDir}.md`), vars);
}

/**
 * Compute a cron schedule for a new agent, staggered within 15-min cycles.
 * Returns a cron expression like "2,17,32,47 * * * *"
 */
export function computeCronSchedule(existingAgentCount: number): string {
  // Stagger by 2 minutes within each 15-minute cycle
  const offset = (existingAgentCount * 2) % 15;
  const minutes = [offset, offset + 15, offset + 30, offset + 45].filter((m) => m < 60).join(",");
  return `${minutes} * * * *`;
}

/**
 * Get the Mission Control URL from environment.
 */
export function getMcUrl(): string {
  const url =
    env.NEXT_PUBLIC_MC_URL ||
    (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "http://localhost:3000");
  if (url === "http://localhost:3000") {
    console.warn(
      "[getMcUrl] WARNING: Using localhost:3000 fallback — set NEXT_PUBLIC_MC_URL for cloud VMs",
    );
  }
  return url;
}

/** Agent-like shape from DB for config generation */
export interface AgentForConfig {
  id: string;
  name: string;
  role: string;
  username: string | null;
  identityEmoji: string | null;
  personality: string | null;
  level: string | null;
  templateId: string | null;
  capabilities?: string[];
}

/**
 * Build the current config bundle (version + files) for an agent. Used by config-bundle API and download.
 */
export function getConfigBundleForAgent(agent: AgentForConfig): {
  version: string;
  files: { filename: string; content: string }[];
} {
  const mcUrl = getMcUrl();
  const agentSlug = getAgentSlug(agent);
  const configFiles = generateAgentConfig(
    {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      username: agentSlug,
      identityEmoji: agent.identityEmoji || "🤖",
      personality: agent.personality || "",
      level: agent.level || AgentLevel.SPECIALIST,
      capabilities: agent.capabilities,
      templateId: agent.templateId || undefined,
    },
    mcUrl,
    undefined,
    "$API_KEY",
  );
  return {
    version: CURRENT_CONFIG_VERSION,
    files: configFiles.map((f) => ({ filename: f.filename, content: f.content })),
  };
}
