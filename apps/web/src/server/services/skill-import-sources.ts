/**
 * Skill import source resolvers (Domain 5 - real import, Paperclip parity).
 *
 * The existing `importSkillPackage` accepts a raw files[] payload (a browser upload). This layer adds
 * the missing half: given a *source spec* it resolves the concrete file(s) + provenance the importer
 * needs. Supported sources:
 *   - GitHub single-file  (a blob URL / owner-repo shorthand → one SKILL.md)
 *   - GitHub *tree* bundle (a /tree/ folder URL → the whole SKILL bundle via the contents API)
 *   - raw http(s) URL
 *   - local filesystem path (server-side, guarded to an allowed base + traversal-checked)
 *   - skills.sh registry ref (`skillsh:<name>` or a skills.sh URL)
 *   - app-catalog ref (`catalog:<id|key>`)
 *
 * Parsing is PURE and unit-tested; only `resolveSkillSource` touches the network / disk, and it takes
 * an injectable `fetchImpl` so tests never hit the wire. Mirrors Paperclip's `resolveSkillSource` /
 * `github-fetch` / `skills-catalog` split.
 *
 * Content is fetched and stored for display only - never executed (the trust ladder still applies once
 * the bundle lands via `importSkillPackage`).
 */
import { sha256Hex as sha256 } from "../hash";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { getCatalogEntry, type CatalogSkill } from "@/server/skill-catalog/manifest";

export type SkillSourceKind = "github" | "github-tree" | "url" | "local" | "skillsh" | "catalog";

/** The DB SkillSourceType a resolved import stamps. Mirrors the Prisma enum values. */
export type ResolvedSourceType = "github" | "url" | "catalog" | "local_path" | "skills_sh";

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

export interface GitHubTreeSourcePlan {
  kind: "github-tree";
  hostname: string;
  owner: string;
  repo: string;
  ref: string;
  /** repo-relative folder that holds SKILL.md (may be "" for the repo root). */
  dir: string;
  /** GitHub contents API URL for `dir` (lists the bundle's files). */
  contentsApiUrl: string;
  locator: string;
}

export interface UrlSourcePlan {
  kind: "url";
  url: string;
  locator: string;
}

export interface LocalSourcePlan {
  kind: "local";
  /** The path exactly as supplied (resolved against the allowed base at fetch time). */
  path: string;
  locator: string;
}

export interface SkillShSourcePlan {
  kind: "skillsh";
  /** Registry skill name/slug (e.g. "vercel-labs/skills/find-skills" or a bare "find-skills"). */
  name: string;
  /** Registry API URL the resolver will fetch to discover the bundle. */
  registryUrl: string;
  /** The original skills.sh URL form, when the spec was a URL (preserved as provenance). */
  originalUrl: string | null;
  locator: string;
}

export interface CatalogSourcePlan {
  kind: "catalog";
  ref: string;
  locator: string;
}

export type SkillSourcePlan =
  | GitHubSourcePlan
  | GitHubTreeSourcePlan
  | UrlSourcePlan
  | LocalSourcePlan
  | SkillShSourcePlan
  | CatalogSourcePlan;

/** A resolved import: the bundle files + provenance to stamp onto the created skill. */
export interface ResolvedSkillImport {
  files: { path: string; content: string }[];
  provenance: {
    sourceType: ResolvedSourceType;
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
const LOCAL_PREFIX = /^local:/i;
const SKILLSH_PREFIX = /^skillsh:/i;
const GITHUB_HOST = /(^|\.)github\.com$/i;
const SKILLS_SH_HOST = /(^|\.)skills\.sh$/i;

/** Configurable skills.sh registry base URL (env override; keeps the resolver fetch-injectable). */
export function skillsShRegistryBase(): string {
  return (process.env.SKILLS_SH_REGISTRY_BASE || "https://skills.sh").replace(/\/+$/, "");
}

/**
 * The allowed base directory for local-path skill imports. Local import is DISABLED unless this env is
 * set - the guard fails closed. Every resolved path must stay inside this base (traversal-checked).
 */
export function localImportBase(): string | null {
  const raw = process.env.SKILL_IMPORT_LOCAL_BASE;
  return raw && raw.trim() ? raw.trim() : null;
}

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

/** GitHub contents API URL for a repo folder. github.com → api.github.com; GHE → /api/v3. */
function contentsApiUrl(
  hostname: string,
  owner: string,
  repo: string,
  ref: string,
  dir: string,
): string {
  const d = dir.replace(/^\/+|\/+$/g, "");
  const base = isGitHubDotCom(hostname) ? "https://api.github.com" : `https://${hostname}/api/v3`;
  const q = ref && ref !== "HEAD" ? `?ref=${encodeURIComponent(ref)}` : "";
  return `${base}/repos/${owner}/${repo}/contents/${d}${q}`;
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

interface GitHubSegments {
  hostname: string;
  owner: string;
  repo: string;
  ref: string;
  marker: string | undefined;
  pathSegments: string[];
}

/** PURE: shared owner/repo/ref/path parsing for the two GitHub source shapes. */
function parseGitHubSegments(spec: string): GitHubSegments {
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
    segments = raw.split("/").filter(Boolean);
  }

  const owner = segments[0];
  const repo = segments[1]?.replace(/\.git$/i, "");
  if (!owner || !repo) {
    throw new SkillSourceError(
      `could not parse a GitHub owner/repo from "${spec}" (expected owner/repo or a github.com URL)`,
    );
  }

  let ref = "HEAD";
  let pathSegments: string[];
  const marker = segments[2];
  if (marker === "blob" || marker === "tree") {
    ref = segments[3] ?? "HEAD";
    pathSegments = segments.slice(4);
  } else {
    pathSegments = segments.slice(2);
  }
  return { hostname, owner, repo, ref, marker, pathSegments };
}

/**
 * PURE: parse a GitHub *single-file* source spec into a fetch plan. Accepts:
 *   - full URLs:  https://github.com/owner/repo[/blob/<ref>/<path>]
 *   - shorthand:  owner/repo[/path]  (ref defaults to HEAD)
 * Rejects anything without a discernible owner + repo.
 */
export function parseGitHubSource(spec: string): GitHubSourcePlan {
  const { hostname, owner, repo, ref, pathSegments } = parseGitHubSegments(spec);
  const path = normalizeGitHubEntryPath(pathSegments.join("/"));
  const rawUrl = rawGitHubUrl(hostname, owner, repo, ref, path);
  const locator = `${owner}/${repo}/${path}@${ref}`;
  return { kind: "github", hostname, owner, repo, ref, path, rawUrl, locator };
}

/**
 * PURE: parse a GitHub *tree* (multi-file bundle) source spec. Given a folder ref, the resolver fetches
 * the whole SKILL bundle (SKILL.md + sibling files) via the contents API, not just the entry doc.
 * Accepts a `.../tree/<ref>/<folder>` URL or an explicit `tree:owner/repo/folder[@ref]` shorthand.
 */
export function parseGitHubTreeSource(spec: string): GitHubTreeSourcePlan {
  let raw = spec
    .trim()
    .replace(/^tree:/i, "")
    .trim();
  // Support a trailing @ref on the shorthand form ("owner/repo/folder@main").
  let refFromShorthand: string | null = null;
  if (!/^https?:\/\//i.test(raw) && !/github\.com/i.test(raw) && raw.includes("@")) {
    const at = raw.lastIndexOf("@");
    refFromShorthand = raw.slice(at + 1) || null;
    raw = raw.slice(0, at);
  }
  const { hostname, owner, repo, ref, pathSegments } = parseGitHubSegments(raw);
  const dir = pathSegments.join("/").replace(/^\/+|\/+$/g, "");
  const effectiveRef = refFromShorthand ?? ref;
  const url = contentsApiUrl(hostname, owner, repo, effectiveRef, dir);
  const locator = `${owner}/${repo}/${dir || "."}@${effectiveRef}`;
  return {
    kind: "github-tree",
    hostname,
    owner,
    repo,
    ref: effectiveRef,
    dir,
    contentsApiUrl: url,
    locator,
  };
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

/** True when a spec looks like a filesystem path (absolute, home/relative, drive letter, backslash). */
function isFilesystemLike(value: string): boolean {
  return (
    LOCAL_PREFIX.test(value) ||
    value.startsWith("file://") ||
    value.startsWith("/") ||
    value.startsWith("~/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.includes("\\")
  );
}

/** PURE: parse a local filesystem path spec into a plan. Accepts `local:<path>`, `file://`, or a path. */
export function parseLocalSource(spec: string): LocalSourcePlan {
  let path = spec.trim().replace(LOCAL_PREFIX, "").trim();
  if (path.startsWith("file://")) {
    try {
      path = new URL(path).pathname;
    } catch {
      throw new SkillSourceError(`not a valid file URL: ${spec}`);
    }
  }
  if (!path) throw new SkillSourceError("local path is required");
  return { kind: "local", path, locator: path };
}

/**
 * PURE: parse a skills.sh registry ref. Accepts:
 *   - `skillsh:<name>`         → registry lookup by name
 *   - `https://skills.sh/owner/repo[/skill]` → the registry's canonical URL form
 *   - a bare `owner/repo/skill` behind the `skillsh:` prefix
 * `registryUrl` is the API endpoint the resolver fetches to discover the bundle.
 */
export function parseSkillShSource(spec: string): SkillShSourcePlan {
  const trimmed = spec.trim();
  const base = skillsShRegistryBase();

  // URL form: https://skills.sh/owner/repo[/skill]
  if (/^https?:\/\//i.test(trimmed) && SKILLS_SH_HOST.test(safeHostname(trimmed) ?? "")) {
    const url = new URL(trimmed);
    const name = url.pathname.split("/").filter(Boolean).join("/");
    if (!name) throw new SkillSourceError(`could not parse a skills.sh skill from "${spec}"`);
    return {
      kind: "skillsh",
      name,
      registryUrl: `${base}/api/skills/${name}`,
      originalUrl: url.toString(),
      locator: `skillsh:${name}`,
    };
  }

  // Prefixed / bare name form.
  const name = trimmed
    .replace(SKILLSH_PREFIX, "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!name) throw new SkillSourceError("skills.sh skill name is required");
  return {
    kind: "skillsh",
    name,
    registryUrl: `${base}/api/skills/${name}`,
    originalUrl: null,
    locator: `skillsh:${name}`,
  };
}

function safeHostname(spec: string): string | null {
  try {
    return new URL(spec).hostname;
  } catch {
    return null;
  }
}

/** PURE: parse a catalog ref ("catalog:<id|key>" or a bare id/key) into a plan. */
export function parseCatalogSource(spec: string): CatalogSourcePlan {
  const ref = spec.trim().replace(CATALOG_PREFIX, "").trim();
  if (!ref) throw new SkillSourceError("catalog ref is required");
  return { kind: "catalog", ref, locator: `catalog:${ref}` };
}

/**
 * PURE: classify + parse any supported source spec into a fetch plan. Dispatch order:
 *   1. "catalog:"                          → catalog
 *   2. "local:" / file:// / filesystem path → local
 *   3. "skillsh:" / skills.sh URL           → skills.sh registry
 *   4. a github.com URL with /tree/          → multi-file github tree
 *   5. a github.com URL or "owner/repo"      → github single-file
 *   6. any other http(s) URL                 → raw url
 * Throws a clear SkillSourceError for an unclassifiable spec.
 */
export function planSkillSource(spec: string): SkillSourcePlan {
  const raw = (spec ?? "").trim();
  if (!raw) throw new SkillSourceError("source is required");

  if (CATALOG_PREFIX.test(raw)) return parseCatalogSource(raw);

  if (isFilesystemLike(raw)) return parseLocalSource(raw);

  if (SKILLSH_PREFIX.test(raw)) return parseSkillShSource(raw);
  if (/^https?:\/\//i.test(raw) && SKILLS_SH_HOST.test(safeHostname(raw) ?? "")) {
    return parseSkillShSource(raw);
  }

  if (/github\.com/i.test(raw)) {
    // A GitHub /tree/ URL denotes a directory → resolve the whole bundle.
    if (/\/tree\//i.test(raw)) return parseGitHubTreeSource(raw);
    return parseGitHubSource(raw);
  }

  if (/^tree:/i.test(raw)) return parseGitHubTreeSource(raw);

  if (/^https?:\/\//i.test(raw)) return parseUrlSource(raw);

  // Bare "owner/repo[/path]" (no scheme, no host) is treated as GitHub shorthand.
  if (/^[^/\s]+\/[^/\s]+/.test(raw) && !raw.includes("://")) return parseGitHubSource(raw);

  throw new SkillSourceError(
    `unrecognized skill source "${spec}" (expected a GitHub URL/owner-repo, an http(s) URL, ` +
      `a local path, skillsh:<name>, or catalog:<ref>)`,
  );
}

/**
 * Reject a bundle-relative path that escapes the bundle (path traversal). Mirrors the repo's skill
 * audit `path_traversal` rule (../) plus the importer's own leading-slash / backslash guards, applied
 * BEFORE any content is fetched or written. Returns the normalized (forward-slash) relative path.
 */
export function assertSafeBundlePath(path: string): string {
  const p = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!p) throw new SkillSourceError("bundle file path is empty");
  if (p.includes("../") || p === ".." || p.endsWith("/..") || p.includes("//")) {
    throw new SkillSourceError(`bundle file path escapes the bundle: "${path}"`);
  }
  return p;
}

type FetchImpl = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const defaultFetch: FetchImpl = (url) => fetch(url) as unknown as ReturnType<FetchImpl>;

async function fetchText(fetchImpl: FetchImpl, url: string): Promise<string> {
  let res: Awaited<ReturnType<FetchImpl>>;
  try {
    res = await fetchImpl(url);
  } catch (err) {
    throw new SkillSourceError(
      `failed to fetch ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) throw new SkillSourceError(`failed to fetch ${url}: HTTP ${res.status}`);
  return res.text();
}

async function fetchJson<T>(fetchImpl: FetchImpl, url: string): Promise<T> {
  const body = await fetchText(fetchImpl, url);
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new SkillSourceError(`expected JSON from ${url}`);
  }
}

function catalogFilesToPayload(entry: CatalogSkill): { path: string; content: string }[] {
  return entry.files.map((f) => ({ path: f.path, content: f.content }));
}

/** Require exactly the bundle-root SKILL.md; returns its content for content-addressed provenance. */
function requireSkillMd(files: { path: string; content: string }[], where: string): string {
  const entry = files.find((f) => /(^|\/)SKILL\.md$/i.test(f.path));
  if (!entry) throw new SkillSourceError(`no SKILL.md found in ${where}`);
  return entry.content;
}

interface GitHubContentsItem {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  download_url: string | null;
  url: string;
}

/**
 * Recursively collect a GitHub folder's files via the contents API. Returns repo-relative paths; the
 * caller rebases them onto the bundle root. Bounded by MAX_TREE_FILES to avoid pathological repos.
 */
const MAX_TREE_FILES = 200;
async function collectGitHubTree(
  fetchImpl: FetchImpl,
  apiUrl: string,
  out: { path: string; content: string }[],
): Promise<void> {
  const items = await fetchJson<GitHubContentsItem[]>(fetchImpl, apiUrl);
  if (!Array.isArray(items)) throw new SkillSourceError(`GitHub folder not found at ${apiUrl}`);
  for (const item of items) {
    if (out.length >= MAX_TREE_FILES) break;
    if (item.type === "file") {
      if (!item.download_url) continue;
      const content = await fetchText(fetchImpl, item.download_url);
      out.push({ path: item.path, content });
    } else if (item.type === "dir") {
      await collectGitHubTree(fetchImpl, item.url, out);
    }
    // symlink / submodule are skipped (never fetched).
  }
}

async function resolveGitHubTree(
  plan: GitHubTreeSourcePlan,
  fetchImpl: FetchImpl,
): Promise<ResolvedSkillImport> {
  const collected: { path: string; content: string }[] = [];
  await collectGitHubTree(fetchImpl, plan.contentsApiUrl, collected);
  if (collected.length === 0) {
    throw new SkillSourceError(`GitHub folder "${plan.locator}" contained no files`);
  }
  const prefix = plan.dir ? `${plan.dir}/` : "";
  const files = collected.map((f) => {
    const rebased = f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path;
    return { path: assertSafeBundlePath(rebased), content: f.content };
  });
  const skillMd = requireSkillMd(files, `GitHub folder "${plan.locator}"`);
  return {
    files,
    provenance: {
      sourceType: "github",
      sourceRef: plan.locator,
      packageName: `${plan.owner}/${plan.repo}`,
      originHash: sha256(skillMd),
    },
  };
}

/**
 * Walk a local directory (bounded) collecting text files. Paths are returned relative to `root`.
 * Skips dotfiles/dirs (.git, node_modules) and anything that traversal-guards reject.
 */
async function collectLocalDir(
  root: string,
  dir: string,
  out: { path: string; content: string }[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (out.length >= MAX_TREE_FILES) break;
    if (ent.name.startsWith(".") || ent.name === "node_modules") continue;
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      await collectLocalDir(root, abs, out);
    } else if (ent.isFile()) {
      const rel = relative(root, abs).split(sep).join("/");
      const safe = assertSafeBundlePath(rel);
      const content = await readFile(abs, "utf8");
      out.push({ path: safe, content });
    }
    // symlinks are ignored (isFile()/isDirectory() are false for a symlink dirent).
  }
}

/**
 * Resolve a local filesystem bundle. Guarded to `SKILL_IMPORT_LOCAL_BASE` (fails closed when unset)
 * and traversal-checked via realpath containment - the resolved target must stay inside the base.
 */
async function resolveLocalSource(plan: LocalSourcePlan): Promise<ResolvedSkillImport> {
  const base = localImportBase();
  if (!base) {
    throw new SkillSourceError(
      "local path import is disabled (set SKILL_IMPORT_LOCAL_BASE to an allowed directory)",
    );
  }
  // Reject an obvious traversal before touching disk.
  if (plan.path.split(/[\\/]/).includes("..")) {
    throw new SkillSourceError(`local path may not contain "..": ${plan.path}`);
  }

  const baseReal = await realpath(base).catch(() => {
    throw new SkillSourceError(`SKILL_IMPORT_LOCAL_BASE does not exist: ${base}`);
  });
  const target = isAbsolute(plan.path) ? plan.path : resolve(baseReal, plan.path);
  let targetReal: string;
  try {
    targetReal = await realpath(target);
  } catch {
    throw new SkillSourceError(`local path not found: ${plan.path}`);
  }
  // Containment: the real target must be the base itself or a descendant of it.
  const rel = relative(baseReal, targetReal);
  if (rel !== "" && (rel.startsWith("..") || isAbsolute(rel))) {
    throw new SkillSourceError(`local path escapes the allowed base (${base}): ${plan.path}`);
  }

  const st = await stat(targetReal);
  let root: string;
  const files: { path: string; content: string }[] = [];
  if (st.isFile()) {
    // Pointed straight at a file (e.g. .../SKILL.md): treat its parent as the bundle root.
    root = targetReal
      .slice(0, targetReal.length - basename(targetReal).length)
      .replace(/[\\/]$/, "");
    await collectLocalDir(root, root, files);
  } else if (st.isDirectory()) {
    root = targetReal;
    await collectLocalDir(root, root, files);
  } else {
    throw new SkillSourceError(`local path is neither a file nor a directory: ${plan.path}`);
  }

  if (files.length === 0)
    throw new SkillSourceError(`local path "${plan.path}" contained no files`);
  const skillMd = requireSkillMd(files, `local path "${plan.path}"`);
  return {
    files,
    provenance: {
      sourceType: "local_path",
      sourceRef: plan.locator,
      packageName: null,
      originHash: sha256(skillMd),
    },
  };
}

/** Documented shape of a skills.sh registry response (implemented against the public contract). */
interface SkillShRegistryResponse {
  name?: string;
  owner?: string;
  repo?: string;
  ref?: string;
  path?: string;
  /** Direct raw download of the entry SKILL.md. */
  downloadUrl?: string;
  /** A pre-bundled file set (preferred when the registry serves it inline). */
  files?: { path: string; content: string }[];
}

/**
 * Resolve a skills.sh registry ref. Queries the (configurable) registry API for the bundle location,
 * then fetches it. Supports three response shapes, in priority order: an inline `files[]` bundle, a
 * `downloadUrl` (raw SKILL.md), or an `owner/repo[/path]@ref` GitHub coordinate. Fully fetch-injectable.
 */
async function resolveSkillSh(
  plan: SkillShSourcePlan,
  fetchImpl: FetchImpl,
): Promise<ResolvedSkillImport> {
  const meta = await fetchJson<SkillShRegistryResponse>(fetchImpl, plan.registryUrl);
  const sourceRef = plan.originalUrl ?? plan.locator;
  const packageName = registryPackageName(plan, meta);

  if (Array.isArray(meta.files) && meta.files.length > 0) {
    const files = meta.files.map((f) => ({
      path: assertSafeBundlePath(f.path),
      content: f.content,
    }));
    const skillMd = requireSkillMd(files, `skills.sh skill "${plan.name}"`);
    return {
      files,
      provenance: { sourceType: "skills_sh", sourceRef, packageName, originHash: sha256(skillMd) },
    };
  }

  let downloadUrl = meta.downloadUrl ?? null;
  if (!downloadUrl && meta.owner && meta.repo) {
    const entry = normalizeGitHubEntryPath(meta.path ?? "");
    downloadUrl = rawGitHubUrl("github.com", meta.owner, meta.repo, meta.ref || "HEAD", entry);
  }
  if (!downloadUrl) {
    throw new SkillSourceError(
      `skills.sh registry response for "${plan.name}" had no files, downloadUrl, or owner/repo`,
    );
  }
  const content = await fetchText(fetchImpl, downloadUrl);
  if (!content.trim())
    throw new SkillSourceError(`skills.sh skill "${plan.name}" resolved an empty SKILL.md`);
  return {
    files: [{ path: "SKILL.md", content }],
    provenance: { sourceType: "skills_sh", sourceRef, packageName, originHash: sha256(content) },
  };
}

function registryPackageName(
  plan: SkillShSourcePlan,
  meta: SkillShRegistryResponse,
): string | null {
  if (meta.owner && meta.repo) return `${meta.owner}/${meta.repo}`;
  // Fall back to the "owner/repo" prefix of the registry name when present.
  const parts = plan.name.split("/").filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  return plan.name || null;
}

/**
 * Resolve a source spec to the concrete import (files + provenance), fetching remote content / reading
 * disk when needed. `fetchImpl` is injectable so unit tests can stub the network. Catalog refs never
 * hit the network - they read the app-shipped manifest.
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

  if (plan.kind === "github-tree") return resolveGitHubTree(plan, fetchImpl);
  if (plan.kind === "local") return resolveLocalSource(plan);
  if (plan.kind === "skillsh") return resolveSkillSh(plan, fetchImpl);

  // Single-document sources: github (single file) + raw url.
  const fetchUrl = plan.kind === "github" ? plan.rawUrl : plan.url;
  const content = await fetchText(fetchImpl, fetchUrl);
  if (!content.trim()) throw new SkillSourceError(`fetched an empty document from ${fetchUrl}`);

  const files = [{ path: "SKILL.md", content }];
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
