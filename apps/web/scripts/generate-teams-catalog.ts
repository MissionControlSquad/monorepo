/**
 * generate-teams-catalog — migrate the code AGENT_TEMPLATES into the shipped markdown teams catalog.
 *
 * HOW TO RUN
 *   npx tsx apps/web/scripts/generate-teams-catalog.ts     # from the repo root
 *
 * WHAT IT DOES
 *   Groups AGENT_TEMPLATES by `category` — each category becomes one `TEAM.md` (a named group of agent
 *   roles) written to `packages/teams-catalog/catalog/<slug>/TEAM.md` via the pure `emitTeamMarkdown`
 *   emitter. Then adds a couple of curated cross-functional teams (Launch Squad, Growth Pod) composed of
 *   specific template roles. No shipped template is dropped: every template is a role in its category
 *   team (asserted by tests/unit/teams-catalog.test.ts). After running, rebuild the index:
 *     node packages/teams-catalog/scripts/build-catalog.mjs
 *
 * This is the one-time authoring tool; the TEAM.md tree it writes is the committed source of truth.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitTeamMarkdown, type TeamPackageFields } from "@agentcenter/utils";
import { AGENT_TEMPLATES } from "../src/server/agent-templates";

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = join(HERE, "../../../packages/teams-catalog/catalog");

// Human titles + a representative icon per category (fallback: the first template's emoji).
const CATEGORY_META: Record<string, { title: string; icon: string }> = {
  research: { title: "Research & Insights", icon: "🔍" },
  content: { title: "Content Studio", icon: "✍️" },
  engineering: { title: "Engineering", icon: "🔧" },
  design: { title: "Design", icon: "🎨" },
  marketing: { title: "Marketing", icon: "📣" },
  management: { title: "Management", icon: "📋" },
  operations: { title: "Operations", icon: "⚙️" },
  finance: { title: "Finance", icon: "🧮" },
  sales: { title: "Sales", icon: "🤝" },
  testing: { title: "Quality & Testing", icon: "🧪" },
  "paid-media": { title: "Paid Media", icon: "🎯" },
  product: { title: "Product", icon: "🧭" },
  "game-development": { title: "Game Development", icon: "🎮" },
  "spatial-computing": { title: "Spatial Computing", icon: "🥽" },
  specialized: { title: "Specialized", icon: "🧩" },
  academic: { title: "Academic", icon: "🎓" },
  "project-management": { title: "Project Management", icon: "📊" },
  custom: { title: "Custom", icon: "✨" },
};

const AUTHOR = "AgentCenter";

function write(team: TeamPackageFields) {
  const dir = join(CATALOG_DIR, team.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "TEAM.md"), emitTeamMarkdown(team));
}

function main() {
  // Fresh tree so removed categories don't linger.
  if (existsSync(CATALOG_DIR)) rmSync(CATALOG_DIR, { recursive: true, force: true });
  mkdirSync(CATALOG_DIR, { recursive: true });

  // One team per category (migration — no template lost).
  const byCategory = new Map<string, typeof AGENT_TEMPLATES>();
  for (const t of AGENT_TEMPLATES) {
    if (!byCategory.has(t.category)) byCategory.set(t.category, []);
    byCategory.get(t.category)!.push(t);
  }

  const categories = [...byCategory.keys()].sort();
  for (const category of categories) {
    const members = byCategory.get(category)!;
    const meta = CATEGORY_META[category] ?? { title: category, icon: members[0]?.emoji ?? "🧩" };
    write({
      name: meta.title,
      slug: category,
      description: `A ready-to-install ${meta.title.toLowerCase()} team of ${members.length} specialist role${members.length === 1 ? "" : "s"}, migrated from the built-in agent templates.`,
      icon: meta.icon,
      tagline: `${members.length} ${meta.title} role${members.length === 1 ? "" : "s"} you can install as one team`,
      author: AUTHOR,
      tags: ["catalog", "migrated", category],
      members: members.map((m) => ({ name: m.name, role: m.role || m.name })),
    });
  }

  // Curated cross-functional teams (new — not a 1:1 category).
  const byId = new Map(AGENT_TEMPLATES.map((t) => [t.id, t]));
  const pick = (ids: string[]) =>
    ids
      .map((id) => byId.get(id))
      .filter((t): t is (typeof AGENT_TEMPLATES)[number] => Boolean(t))
      .map((t) => ({ name: t.name, role: t.role || t.name }));

  write({
    name: "Product Launch Squad",
    slug: "launch-squad",
    description:
      "A cross-functional squad to take a product from zero to launch: coordination, engineering, design, QA, and launch content.",
    icon: "🚀",
    tagline: "Ship a product end-to-end with one install",
    author: AUTHOR,
    tags: ["catalog", "cross-functional", "launch"],
    members: pick([
      "squad-lead",
      "frontend-dev",
      "backend-dev",
      "ux-designer",
      "qa-testing",
      "content-writer",
    ]),
  });

  write({
    name: "Growth Pod",
    slug: "growth-pod",
    description:
      "A demand-generation pod: growth experiments, SEO, lifecycle email, analytics, and social — wired to move activation and retention.",
    icon: "📈",
    tagline: "A full-stack growth team in one install",
    author: AUTHOR,
    tags: ["catalog", "cross-functional", "growth"],
    members: pick([
      "growth-hacker",
      "seo-strategist",
      "email-marketer",
      "data-analyst",
      "social-media",
    ]),
  });

  console.log(`wrote ${categories.length} category teams + 2 curated teams to ${CATALOG_DIR}`);
}

main();
