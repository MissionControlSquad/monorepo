/**
 * App-shipped skills catalog (Domain 5 - Paperclip `@paperclipai/skills-catalog` parity, first slice).
 *
 * A small, curated, content-addressed catalog of bundled skills that any workspace can install without
 * an external source. Each entry is built from an in-repo `agent-templates/skills/*.md` corpus so the
 * catalog reuses the markdown we already ship. Every file carries a sha256; the entry carries a
 * `contentHash` over its files so an install can record verifiable provenance (and a later re-install
 * can detect drift). Content is display/storage only - never executed.
 *
 * This is deliberately a static, in-process manifest (no build step): the source markdown is read once
 * at module load and hashed. `getCatalogEntry` resolves by id or key.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SkillTrustLevel } from "@agentcenter/database";
import { deriveSkillTrustLevel } from "@agentcenter/utils";

export const CATALOG_PACKAGE_NAME = "@agentcenter/skills-catalog";
export const CATALOG_PACKAGE_VERSION = "0.1.0";
export const CATALOG_SCHEMA_VERSION = 1 as const;

export interface CatalogSkillFile {
  path: string;
  content: string;
  sha256: string;
}

export interface CatalogSkill {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  trustLevel: SkillTrustLevel;
  files: CatalogSkillFile[];
  contentHash: string;
  packageName: string;
  packageVersion: string;
}

export interface CatalogManifest {
  schemaVersion: typeof CATALOG_SCHEMA_VERSION;
  packageName: string;
  packageVersion: string;
  skills: CatalogSkill[];
}

interface CatalogSeed {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  /** File name under apps/web/src/server/agent-templates/skills/ (the reused corpus). */
  sourceFile: string;
}

// First solid slice: three markdown-only bundled skills reused from the shipped agent-templates corpus.
const SEEDS: CatalogSeed[] = [
  {
    id: "skl_technical_writer",
    key: "technical-writer",
    name: "Technical Writer",
    description:
      "Documentation-as-a-product craft guide: API references, tutorials, and clear docs.",
    category: "content",
    tags: ["writing", "documentation", "developer-experience"],
    sourceFile: "technical-writer.md",
  },
  {
    id: "skl_software_architect",
    key: "software-architect",
    name: "Software Architect",
    description: "System design methodology: trade-offs, boundaries, and durable architecture.",
    category: "engineering",
    tags: ["architecture", "system-design", "engineering"],
    sourceFile: "software-architect.md",
  },
  {
    id: "skl_customer_support",
    key: "customer-support",
    name: "Customer Support",
    description: "Support craft guide: empathetic triage, resolution, and escalation standards.",
    category: "operations",
    tags: ["support", "customer", "operations"],
    sourceFile: "customer-support.md",
  },
];

// Mirrors agent-role-skill.ts: the shipped corpus lives under apps/web/src/server/agent-templates/skills.
const CORPUS_DIR = join(process.cwd(), "src", "server", "agent-templates", "skills");

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

const LEADING_FRONTMATTER = /^\uFEFF?---[\s\S]*?---\s*/;

/** Prepend a minimal SKILL.md frontmatter block so importers derive name/key/description/tags. */
function withFrontmatter(seed: CatalogSeed, body: string): string {
  const fm = [
    "---",
    `name: ${seed.name}`,
    `key: ${seed.key}`,
    `description: ${seed.description}`,
    `tags: [${seed.tags.join(", ")}]`,
    "---",
    "",
  ].join("\n");
  return fm + body.replace(LEADING_FRONTMATTER, ""); // strip any existing frontmatter first
}

function buildEntry(seed: CatalogSeed): CatalogSkill {
  const body = readFileSync(join(CORPUS_DIR, seed.sourceFile), "utf8");
  const skillMd = withFrontmatter(seed, body);
  const files: CatalogSkillFile[] = [
    { path: "SKILL.md", content: skillMd, sha256: sha256(skillMd) },
  ];
  const contentHash = sha256(files.map((f) => `${f.path}:${f.sha256}`).join("\n"));
  return {
    id: seed.id,
    key: seed.key,
    name: seed.name,
    description: seed.description,
    category: seed.category,
    tags: seed.tags,
    trustLevel: deriveSkillTrustLevel(files.map((f) => f.path)),
    files,
    contentHash,
    packageName: CATALOG_PACKAGE_NAME,
    packageVersion: CATALOG_PACKAGE_VERSION,
  };
}

let cached: CatalogManifest | null = null;

/** The app-shipped catalog manifest (built + cached on first access). */
export function catalogManifest(): CatalogManifest {
  if (cached) return cached;
  cached = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    packageName: CATALOG_PACKAGE_NAME,
    packageVersion: CATALOG_PACKAGE_VERSION,
    skills: SEEDS.map(buildEntry),
  };
  return cached;
}

/** List all catalog entries. */
export function listCatalogSkills(): CatalogSkill[] {
  return catalogManifest().skills;
}

/** Resolve a catalog entry by id or key. Returns null when not found. */
export function getCatalogEntry(ref: string): CatalogSkill | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  return listCatalogSkills().find((s) => s.id === trimmed || s.key === trimmed) ?? null;
}
