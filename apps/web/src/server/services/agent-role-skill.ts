import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Cloud-served role skills. The control plane owns the role skill guides (agent-templates/skills/*.md);
// agents fetch them via the context API — they are NOT required to have local skill files. This is what
// lets an agent run its craft correctly in ANY environment (fresh box, cloud sandbox, CI) — everything
// it needs comes from the server, not a previously-downloaded bundle.
const SKILLS_DIR = join(process.cwd(), "src", "server", "agent-templates", "skills");
// Only allow safe template ids (alphanumeric + hyphen) — avoids path traversal.
const SAFE_TEMPLATE_ID = /^[a-z0-9-]+$/i;

/** Curated role → template-id map for common roles whose free-text name doesn't kebab-match a file. */
const ROLE_ALIASES: Record<string, string> = {
  "squad-lead": "squad-lead",
  "tech-lead": "squad-lead",
  "team-lead": "squad-lead",
  "engineering-lead": "squad-lead",
  "frontend-developer": "frontend-dev",
  "frontend-engineer": "frontend-dev",
  "backend-developer": "backend-dev",
  "backend-engineer": "backend-dev",
  "fullstack-developer": "backend-dev",
  "full-stack-developer": "backend-dev",
  "qa-engineer": "qa-testing",
  "qa": "qa-testing",
  "test-engineer": "qa-testing",
  "quality-assurance": "qa-testing",
  "devops-engineer": "devops",
  "mobile-developer": "mobile-app-builder",
  "mobile-engineer": "mobile-app-builder",
};

const kebab = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const templateExists = (id: string) =>
  SAFE_TEMPLATE_ID.test(id) && existsSync(join(SKILLS_DIR, `${id}.md`));

/**
 * Best-effort resolve a template id from a free-text role (e.g. "Backend Developer" → "backend-dev"),
 * so agents without an explicit templateId still get their specific role skill. Conservative: only
 * returns a match that actually exists in the library, else null (caller uses the generic guide).
 */
export function resolveRoleTemplateId(role: string): string | null {
  const n = kebab(role);
  if (ROLE_ALIASES[n] && templateExists(ROLE_ALIASES[n])) return ROLE_ALIASES[n];
  if (templateExists(n)) return n; // exact kebab match (e.g. "devops")
  const dev = n.replace(/-developer$/, "-dev"); // "x-developer" → "x-dev"
  if (dev !== n && templateExists(dev)) return dev;
  return null;
}

export interface RoleSkill {
  key: string;
  name: string;
  description: string | null;
  markdown: string;
}

/**
 * Load an agent's role skill guide from the control plane's template library (server-side files),
 * so it is delivered from the CLOUD rather than a local bundle. Falls back to a generic role guide
 * when no template matches. Returns `null` only if `role` is missing.
 */
export function loadRoleSkill(
  templateId: string | null | undefined,
  role: string | null | undefined,
  name?: string | null,
): RoleSkill | null {
  if (!role) return null;
  // Prefer the agent's explicit templateId; otherwise derive one from its role.
  const effectiveId =
    templateId && templateExists(templateId) ? templateId : resolveRoleTemplateId(role);
  if (effectiveId) {
    const path = join(SKILLS_DIR, `${effectiveId}.md`);
    // Render the identity template vars so the delivered skill reads cleanly.
    const markdown = readFileSync(path, "utf8")
      .replaceAll("{{agent.role}}", role)
      .replaceAll("{{agent.name}}", name ?? role);
    return {
      key: `role:${effectiveId}`,
      name: `${role} Guide`,
      description: `Cloud-served role skill for ${role}`,
      markdown,
    };
  }
  return {
    key: "role:generic",
    name: `${role} Guide`,
    description: `Generic cloud-served role guide for ${role}`,
    markdown: `# SKILL — ${role} Guide

How you work as a ${role}. This is your craft.

## How You Work (Non-Negotiable)
- **Read before you write.** Read the task description, its parent, upstream deliverables, and messages before you start.
- **Don't work blocked tasks.** If \`blockedByTaskId\` is set and that task isn't done, pick a different task.
- **Ask, don't guess.** Post a question on the task instead of guessing.
- **Ship a deliverable.** Submit your work as a deliverable via the API when done, then move the task to review.`,
  };
}
