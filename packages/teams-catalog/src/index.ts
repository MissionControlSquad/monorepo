/**
 * @agentcenter/teams-catalog — the app-shipped teams catalog (Domain 14 — Paperclip teams-catalog
 * parity).
 *
 * This package ships a real directory tree of team packages under `catalog/<slug>/TEAM.md` plus a build
 * step (`scripts/build-catalog.mjs`, run via `npm run catalog:build`) that walks the tree, parses each
 * `TEAM.md` (agentcompanies/v1 frontmatter + a `## Roles` list), content-addresses every file, stamps a
 * pinned `sourceRef` (github:owner/repo@commit#sha256:<hex>), and emits `generated/teams.json` — the
 * shipped, content-addressed manifest imported here with provenance.
 *
 * The TEAM.md tree is authored from the code `AGENT_TEMPLATES` (one team per template category) plus a
 * couple of curated cross-functional teams — see apps/web/scripts/generate-teams-catalog.ts. The JSON is
 * generated + committed; do not hand-edit. Content is display/storage only — never executed.
 */
import rawCatalog from "../generated/teams.json";

export type TeamTrustLevel =
  | "markdown_only"
  | "assets"
  | "scripts_executables"
  | "external_sources";

export interface CatalogFile {
  path: string;
  sha256: string;
  content: string;
}

export interface CatalogTeamRole {
  name: string;
  role: string;
}

export interface CatalogTeamEntry {
  /** Stable id `team_<slug_with_underscores>`. */
  id: string;
  slug: string;
  key: string;
  name: string;
  description: string;
  tagline: string;
  icon: string | null;
  author: string | null;
  tags: string[];
  trustLevel: TeamTrustLevel;
  roles: CatalogTeamRole[];
  /** Pinned provenance: `github:<owner>/<repo>@<commit>#sha256:<contentHash>`. */
  sourceRef: string;
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

export interface TeamsCatalog {
  schemaVersion: number;
  packageName: string;
  packageVersion: string;
  catalogRef: CatalogRef | null;
  teams: CatalogTeamEntry[];
}

/** The generated, content-addressed manifest. */
export const teamsCatalog = rawCatalog as unknown as TeamsCatalog;

export const TEAMS_CATALOG_PACKAGE_NAME = teamsCatalog.packageName;
export const TEAMS_CATALOG_PACKAGE_VERSION = teamsCatalog.packageVersion;
export const TEAMS_CATALOG_SCHEMA_VERSION = teamsCatalog.schemaVersion;

/** All catalog teams, sorted by id. */
export function listCatalogTeams(): CatalogTeamEntry[] {
  return teamsCatalog.teams;
}

/** Resolve a catalog team by id, slug, or key. Returns null when not found. */
export function getCatalogTeam(ref: string): CatalogTeamEntry | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  return (
    teamsCatalog.teams.find((t) => t.id === trimmed || t.slug === trimmed || t.key === trimmed) ??
    null
  );
}
