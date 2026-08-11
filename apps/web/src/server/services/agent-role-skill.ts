import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseSkillFrontmatter, splitFrontmatter } from "@agentcenter/utils";

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
  qa: "qa-testing",
  "test-engineer": "qa-testing",
  "quality-assurance": "qa-testing",
  "devops-engineer": "devops",
  "mobile-developer": "mobile-app-builder",
  "mobile-engineer": "mobile-app-builder",
};

const kebab = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const templateExists = (id: string) =>
  SAFE_TEMPLATE_ID.test(id) && existsSync(join(SKILLS_DIR, `${id}.md`));

/**
 * PURE: build the reverse `role → template-id` index from a set of template frontmatters. A skill that
 * declares `recommendedForRoles: [x, y]` recommends itself for roles x and y. Roles are kebab-normalized
 * so free-text roles ("Growth Lead") match a declared "growth-lead". First declaration wins on a
 * collision, so the map is deterministic regardless of directory order (callers pass ids sorted).
 * Exported for unit testing the resolution independent of the filesystem.
 */
export function buildRoleRecommendationIndex(
  entries: { id: string; recommendedForRoles?: string[] | null }[],
): Record<string, string> {
  const index: Record<string, string> = {};
  for (const entry of entries) {
    if (!SAFE_TEMPLATE_ID.test(entry.id)) continue;
    for (const raw of entry.recommendedForRoles ?? []) {
      const role = kebab(raw);
      if (role && !(role in index)) index[role] = entry.id;
    }
  }
  return index;
}

// Cached reverse index of role → template-id derived from each template's `recommendedForRoles`
// frontmatter. Built lazily on first use (scans the template library once) so a skill can recommend
// itself for a role even when its filename/alias doesn't match. Cleared only per-process.
let roleRecommendationIndex: Record<string, string> | null = null;

function loadRoleRecommendationIndex(): Record<string, string> {
  if (roleRecommendationIndex) return roleRecommendationIndex;
  let files: string[] = [];
  try {
    files = readdirSync(SKILLS_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort();
  } catch {
    // Library missing (unexpected) → empty index; callers fall back to alias/filename.
    roleRecommendationIndex = {};
    return roleRecommendationIndex;
  }
  const entries = files.map((f) => {
    const id = f.replace(/\.md$/, "");
    let recommendedForRoles: string[] | undefined;
    try {
      const fm = parseSkillFrontmatter(readFileSync(join(SKILLS_DIR, f), "utf8"));
      recommendedForRoles = Array.isArray(fm?.recommendedForRoles)
        ? fm.recommendedForRoles
        : undefined;
    } catch {
      recommendedForRoles = undefined;
    }
    return { id, recommendedForRoles };
  });
  roleRecommendationIndex = buildRoleRecommendationIndex(entries);
  return roleRecommendationIndex;
}

/** Test seam: drop the cached index so a test that annotates fixtures re-scans the library. */
export function resetRoleRecommendationIndex(): void {
  roleRecommendationIndex = null;
}

/**
 * Best-effort resolve a template id from a free-text role (e.g. "Backend Developer" → "backend-dev"),
 * so agents without an explicit templateId still get their specific role skill. Resolution order:
 *   1. a skill that declares this role in its `recommendedForRoles` frontmatter (a skill recommends
 *      itself for the role, even when its filename/alias doesn't match);
 *   2. the curated alias map;
 *   3. an exact kebab filename match (e.g. "devops");
 *   4. the "x-developer" → "x-dev" fallback.
 * Conservative: only returns a match that actually exists in the library, else null (caller uses the
 * generic guide).
 */
export function resolveRoleTemplateId(role: string): string | null {
  const n = kebab(role);
  // 1. frontmatter recommendation (a skill recommends itself for this role)
  const recommended = loadRoleRecommendationIndex()[n];
  if (recommended && templateExists(recommended)) return recommended;
  // 2–4. existing alias/filename fallbacks.
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
    // Strip any authoring frontmatter (e.g. recommendedForRoles) so the delivered guide is clean prose,
    // then render the identity template vars.
    const raw = readFileSync(path, "utf8");
    const { body } = splitFrontmatter(raw);
    const markdown = body
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
