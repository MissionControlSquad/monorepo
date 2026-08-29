/**
 * App-shipped skills catalog (Domain 5 — Paperclip `@paperclipai/skills-catalog` parity).
 *
 * The catalog is now a real, versioned package: `@agentcenter/skills-catalog` ships a directory tree of
 * skill packages (`catalog/<tier>/<category>/<slug>/SKILL.md` + supporting files) and a build step that
 * emits a content-addressed `generated/catalog.json`. This module loads that generated manifest and
 * adapts it to the public `CatalogSkill` shape the app already consumes — so `installCatalogSkill` /
 * `importFromCatalog` keep working unchanged. Every file carries a sha256; each entry carries a
 * `contentHash` over its files, stamped onto an install as verifiable provenance. Content is
 * display/storage only — never executed. `getCatalogEntry` resolves by id, slug, or key.
 *
 * To change the catalog: edit the tree under `packages/skills-catalog/catalog/`, run `npm run
 * catalog:build`, and commit the regenerated `catalog.json`. Do not hand-edit the generated file.
 */
import type { SkillTrustLevel } from "@agentcenter/database";
import {
  listCatalogSkills as listPackageSkills,
  skillsCatalog,
  type CatalogSkillEntry,
} from "@agentcenter/skills-catalog";

export const CATALOG_PACKAGE_NAME = skillsCatalog.packageName;
export const CATALOG_PACKAGE_VERSION = skillsCatalog.packageVersion;
export const CATALOG_SCHEMA_VERSION = skillsCatalog.schemaVersion;

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
  /** `bundled` = shipped/default; `optional` = catalog-available but not installed by default. */
  tier: "bundled" | "optional";
  recommendedForRoles: string[];
  trustLevel: SkillTrustLevel;
  files: CatalogSkillFile[];
  contentHash: string;
  packageName: string;
  packageVersion: string;
}

export interface CatalogManifest {
  schemaVersion: number;
  packageName: string;
  packageVersion: string;
  skills: CatalogSkill[];
}

/** Adapt a generated package entry to the app's public CatalogSkill shape. */
function adapt(entry: CatalogSkillEntry): CatalogSkill {
  return {
    id: entry.id,
    key: entry.key,
    name: entry.name,
    description: entry.description,
    category: entry.category,
    tags: entry.tags,
    tier: entry.tier,
    recommendedForRoles: entry.recommendedForRoles,
    trustLevel: entry.trustLevel as SkillTrustLevel,
    files: entry.files.map((f) => ({ path: f.path, content: f.content, sha256: f.sha256 })),
    contentHash: entry.contentHash,
    packageName: CATALOG_PACKAGE_NAME,
    packageVersion: CATALOG_PACKAGE_VERSION,
  };
}

let cached: CatalogManifest | null = null;

/** The app-shipped catalog manifest (adapted from the package's generated JSON, cached on first access). */
export function catalogManifest(): CatalogManifest {
  if (cached) return cached;
  cached = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    packageName: CATALOG_PACKAGE_NAME,
    packageVersion: CATALOG_PACKAGE_VERSION,
    skills: listPackageSkills().map(adapt),
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
