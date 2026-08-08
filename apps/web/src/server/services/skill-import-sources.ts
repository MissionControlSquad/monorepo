/**
 * Skill import source resolvers (Domain 5 - real import, Paperclip parity).
 *
 * The existing `importSkillPackage` accepts a raw files[] payload (a browser upload). This layer adds
 * the missing half: given a *source spec* (a GitHub URL, a raw file URL, or an app-catalog ref) it
 * resolves the concrete file(s) + provenance the importer needs. The parsing is PURE and unit-tested;
 * only `resolveSkillSource` touches the network, and it takes an injectable `fetchImpl` so tests never
 * hit the wire. Mirrors Paperclip's `resolveSkillSource` / `github-fetch` / `skills-catalog` split.
 *
 * Content is fetched and stored for display only - never executed (the trust ladder still applies once
 * the bundle lands via `importSkillPackage`).
 */
import { createHash } from "node:crypto";
import { getCatalogEntry, type CatalogSkill } from "@/server/skill-catalog/manifest";

export type SkillSourceKind = "github" | "url" | "catalog";

export interface GitHubSourcePlan {
  kind: "github";
  hostname: string;
  owner: string;
  repo: string;
  ref: string; // branch / tag / commit; defaults to "HEAD" when the URL omits it
  path: string; // repo-relative path to the SKILL.md (or the folder that holds it)
  /** The raw.githubusercontent URL the resolver will fetch. */
  rawUrl: string;
  /** Stable human locator, e.g. "owner/repo/path@ref". */
  locator: string;
}

export interface UrlSourcePlan {
  kind: "url";
  url: string;
  locator: string;
}

export interface CatalogSourcePlan {
  kind: "catalog";
  ref: string;
  locator: string;
}

export type SkillSourcePlan = GitHubSourcePlan | UrlSourcePlan | CatalogSourcePlan;

/** A resolved import: the bundle files + provenance to stamp onto the created skill. */
export interface ResolvedSkillImport {
  files: { path: string; content: string }[];
  provenance: {
    sourceType: "github" | "url" | "catalog";
    sourceRef: string;
    packageName: string | null;
    originHash: string;
  };
}

export class SkillSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillSourceError";
  }
}

const CATALOG_PREFIX = /^catalog:/i;
const GITHUB_HOST = /(^|\.)github\.com$/i;

function isGitHubDotCom(hostname: string): boolean {
  return GITHUB_HOST.test(hostname.toLowerCase());
}

function rawGitHubUrl(
  hostname: string,
  owner: string,
  repo: string,
  ref: string,
  filePath: string,
): string {
  const p = filePath.replace(/^\/+/, "");
  return isGitHubDotCom(hostname)
    ? `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${p}`
    : `https://${hostname}/raw/${owner}/${repo}/${ref}/${p}`;
}

/**
 * Normalize a GitHub-relative path to the SKILL.md entry doc. If the caller points at a folder (no
 * ".md" suffix) we append SKILL.md; a bare "" resolves to the repo-root SKILL.md.
 */
function normalizeGitHubEntryPath(path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, "");
  if (!clean) return "SKILL.md";
  if (/\.md$/i.test(clean)) return clean;
  return `${clean}/SKILL.md`;
}

/**
 * PURE: parse a GitHub source spec into a fetch plan. Accepts:
 *   - full URLs:  https://github.com/owner/repo[/blob/<ref>/<path>] , https://github.com/owner/repo/tree/<ref>/<path>
 *   - shorthand:  owner/repo[/path]  (ref defaults to HEAD)
 * Rejects anything without a discernible owner + repo.
 */
export function parseGitHubSource(spec: string): GitHubSourcePlan {
  const raw = spec.trim();
  if (!raw) throw new SkillSourceError("source is required");

  let hostname = "github.com";
  let segments: string[];

  if (/^https?:\/\//i.test(raw) || /github\.com/i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    } catch {
      throw new SkillSourceError(`not a valid GitHub URL: ${spec}`);
    }
    hostname = url.hostname;
    segments = url.pathname.split("/").filter(Boolean);
  } else {
    // shorthand "owner/repo[/path]"
    segments = raw.split("/").filter(Boolean);
  }

  const owner = segments[0];
  const repo = segments[1]?.replace(/\.git$/i, "");
  if (!owner || !repo) {
    throw new SkillSourceError(
      `could not parse a GitHub owner/repo from "${spec}" (expected owner/repo or a github.com URL)`,
    );
  }

  // Handle .../blob/<ref>/<path> and .../tree/<ref>/<path>; otherwise remaining segments are the path.
  let ref = "HEAD";
  let pathSegments: string[];
  const marker = segments[2];
  if (marker === "blob" || marker === "tree") {
    ref = segments[3] ?? "HEAD";
    pathSegments = segments.slice(4);
  } else {
    pathSegments = segments.slice(2);
  }

  const path = normalizeGitHubEntryPath(pathSegments.join("/"));
  const rawUrl = rawGitHubUrl(hostname, owner, repo, ref, path);
  const locator = `${owner}/${repo}/${path}@${ref}`;
  return { kind: "github", hostname, owner, repo, ref, path, rawUrl, locator };
}

/** PURE: parse a raw file URL (http/https) into a plan. Rejects non-http(s) schemes. */
export function parseUrlSource(spec: string): UrlSourcePlan {
  const raw = spec.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SkillSourceError(`not a valid URL: ${spec}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SkillSourceError(`only http(s) URLs are supported, got "${url.protocol}"`);
  }
  return { kind: "url", url: url.toString(), locator: url.toString() };
}

/** PURE: parse a catalog ref ("catalog:<id|key>" or a bare id/key) into a plan. */
export function parseCatalogSource(spec: string): CatalogSourcePlan {
  const ref = spec.trim().replace(CATALOG_PREFIX, "").trim();
  if (!ref) throw new SkillSourceError("catalog ref is required");
  return { kind: "catalog", ref, locator: `catalog:${ref}` };
}

/**
 * PURE: classify + parse any supported source spec into a fetch plan. Dispatch order:
 *   1. explicit "catalog:" prefix  → catalog
 *   2. a github.com URL or "owner/repo" shorthand → github
 *   3. any other http(s) URL → raw url
 * Throws a clear SkillSourceError for an unclassifiable spec.
 */
export function planSkillSource(spec: string): SkillSourcePlan {
  const raw = (spec ?? "").trim();
  if (!raw) throw new SkillSourceError("source is required");

  if (CATALOG_PREFIX.test(raw)) return parseCatalogSource(raw);

  if (/github\.com/i.test(raw)) return parseGitHubSource(raw);

  if (/^https?:\/\//i.test(raw)) return parseUrlSource(raw);

  // Bare "owner/repo[/path]" (no scheme, no host) is treated as GitHub shorthand.
  if (/^[^/\s]+\/[^/\s]+/.test(raw) && !raw.includes("://")) return parseGitHubSource(raw);

  throw new SkillSourceError(
    `unrecognized skill source "${spec}" (expected a GitHub URL/owner-repo, an http(s) URL, or catalog:<ref>)`,
  );
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Derive a filename → path for a raw-URL import (used for the entry SKILL.md name only). */
function skillMdFileName(): string {
  return "SKILL.md";
}

type FetchImpl = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const defaultFetch: FetchImpl = (url) => fetch(url) as unknown as ReturnType<FetchImpl>;

function catalogFilesToPayload(entry: CatalogSkill): { path: string; content: string }[] {
  return entry.files.map((f) => ({ path: f.path, content: f.content }));
}

/**
 * Resolve a source spec to the concrete import (files + provenance), fetching remote content when
 * needed. `fetchImpl` is injectable so unit tests can stub the network. Catalog refs never hit the
 * network - they read the app-shipped manifest.
 */
export async function resolveSkillSource(
  spec: string,
  opts: { fetchImpl?: FetchImpl } = {},
): Promise<ResolvedSkillImport> {
  const fetchImpl = opts.fetchImpl ?? defaultFetch;
  const plan = planSkillSource(spec);

  if (plan.kind === "catalog") {
    const entry = getCatalogEntry(plan.ref);
    if (!entry) throw new SkillSourceError(`catalog skill "${plan.ref}" not found`);
    const files = catalogFilesToPayload(entry);
    return {
      files,
      provenance: {
        sourceType: "catalog",
        // Normalize to the entry id so provenance matches importFromCatalog regardless of ref form.
        sourceRef: `catalog:${entry.id}`,
        packageName: entry.packageName,
        originHash: entry.contentHash,
      },
    };
  }

  const fetchUrl = plan.kind === "github" ? plan.rawUrl : plan.url;
  let res: Awaited<ReturnType<FetchImpl>>;
  try {
    res = await fetchImpl(fetchUrl);
  } catch (err) {
    throw new SkillSourceError(
      `failed to fetch ${fetchUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    throw new SkillSourceError(`failed to fetch ${fetchUrl}: HTTP ${res.status}`);
  }
  const content = await res.text();
  if (!content.trim()) throw new SkillSourceError(`fetched an empty document from ${fetchUrl}`);

  const files = [{ path: skillMdFileName(), content }];
  const packageName = plan.kind === "github" ? `${plan.owner}/${plan.repo}` : null;
  return {
    files,
    provenance: {
      sourceType: plan.kind,
      sourceRef: plan.locator,
      packageName,
      originHash: sha256(content),
    },
  };
}
