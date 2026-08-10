/**
 * @agentcenter/skills-catalog — the app-shipped skills catalog.
 *
 * This package ships a real directory tree of skill packages under `catalog/<tier>/<category>/<slug>/`
 * plus a build step (`scripts/build-catalog.mjs`, run via `npm run catalog:build`) that walks the tree,
 * parses + lints each `SKILL.md`, content-addresses every file, and emits `generated/catalog.json` — the
 * shipped, content-addressed manifest imported here with provenance (packageName + per-skill contentHash).
 *
 * Content is display/storage only — never executed. The JSON is generated + committed; do not hand-edit.
 */
import rawCatalog from "../generated/catalog.json";

export type SkillTrustLevel = "markdown_only" | "assets" | "scripts_executables";
export type CatalogTier = "bundled" | "optional";

export interface CatalogFile {
  path: string;
  sha256: string;
  content: string;
}

export interface CatalogSkillEntry {
  /** Stable id `skl_<slug_with_underscores>`. */
  id: string;
  slug: string;
  key: string;
  name: string;
  description: string;
  category: string;
  /** `bundled` = shipped/default; `optional` = available in the catalog but not installed by default. */
  tier: CatalogTier;
  tags: string[];
  recommendedForRoles: string[];
  trustLevel: SkillTrustLevel;
  /** sha256 over `${path}:${sha256}` of each file (sorted) — verifiable install provenance. */
  contentHash: string;
  files: CatalogFile[];
}

/** Pinned upstream ref for future remote catalog updates (remote fetch deferred; see catalog-ref.json). */
export interface CatalogRef {
  repo: string;
  ref: string;
  commit: string | null;
  fetchedAt: string | null;
}

export interface SkillsCatalog {
  schemaVersion: number;
  packageName: string;
  packageVersion: string;
  catalogRef: CatalogRef | null;
  skills: CatalogSkillEntry[];
}

/** The generated, content-addressed manifest. */
export const skillsCatalog = rawCatalog as unknown as SkillsCatalog;

export const CATALOG_PACKAGE_NAME = skillsCatalog.packageName;
export const CATALOG_PACKAGE_VERSION = skillsCatalog.packageVersion;
export const CATALOG_SCHEMA_VERSION = skillsCatalog.schemaVersion;

/** All catalog entries (bundled + optional), sorted by id. */
export function listCatalogSkills(): CatalogSkillEntry[] {
  return skillsCatalog.skills;
}

/** Resolve a catalog entry by id, slug, or key. Returns null when not found. */
export function getCatalogSkill(ref: string): CatalogSkillEntry | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  return (
    skillsCatalog.skills.find((s) => s.id === trimmed || s.slug === trimmed || s.key === trimmed) ??
    null
  );
}
