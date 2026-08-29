#!/usr/bin/env node
/**
 * build-catalog — walk the in-repo teams catalog tree and emit the content-addressed manifest.
 *
 * HOW TO RUN
 *   node packages/teams-catalog/scripts/build-catalog.mjs     # from the repo root
 *   npm run catalog:build                                     # equivalent, from anywhere
 *
 * WHAT IT DOES
 *   1. Walks `catalog/<slug>/TEAM.md` (+ any supporting files).
 *   2. Parses + lints each `TEAM.md` (agentcompanies/v1 frontmatter: kind=team, name, slug; a `## Roles`
 *      list of `- name — role`). Reimplemented here so the build runs on plain `node`, zero deps.
 *   3. Content-addresses every file (sha256) and every team (`contentHash` over its files), derives the
 *      trust ladder, stamps a pinned `sourceRef` = `<repo>@<ref>#sha256:<contentHash>`, and writes
 *      `generated/teams.json`.
 *
 * REPRODUCIBLE: no timestamps, no machine paths, keys emitted in a fixed sorted order, teams sorted by
 * id, files sorted by path. Re-running with unchanged inputs produces a byte-identical file (no diff).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join, relative, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_DIR = process.env.TEAMS_CATALOG_SRC || join(PKG_DIR, "catalog");
const OUT_FILE = process.env.TEAMS_CATALOG_OUT || join(PKG_DIR, "generated", "teams.json");
const REF_FILE = process.env.TEAMS_CATALOG_REF || join(PKG_DIR, "catalog-ref.json");

const pkg = JSON.parse(readFileSync(join(PKG_DIR, "package.json"), "utf8"));
const SCHEMA_VERSION = 1;

const sha256 = (input) => createHash("sha256").update(input, "utf8").digest("hex");

// ─── frontmatter parse (mirrors @agentcenter/utils skill-frontmatter) ─
function splitFrontmatter(markdown) {
  const text = markdown ?? "";
  const m = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/.exec(text);
  if (!m) return { raw: null, body: text };
  return { raw: m[1], body: m[2] ?? "" };
}
function coerceScalar(raw) {
  const v = raw.trim().replace(/^["']|["']$/g, "");
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}
function parseInlineList(raw) {
  return raw
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}
function parseFrontmatter(markdown) {
  const { raw } = splitFrontmatter(markdown);
  if (raw === null) return null;
  const out = {};
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const kv = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, rest] = kv;
    if (rest.trim() === "") {
      const items = [];
      while (i + 1 < lines.length && /^[ \t]*-[ \t]+/.test(lines[i + 1]))
        items.push(
          lines[++i]
            .replace(/^[ \t]*-[ \t]+/, "")
            .trim()
            .replace(/^["']|["']$/g, ""),
        );
      if (items.length) out[key] = items;
    } else if (rest.trim().startsWith("[")) {
      out[key] = parseInlineList(rest);
    } else {
      out[key] = coerceScalar(rest);
    }
  }
  return out;
}

// Parse the `## Roles` block: `- name — role` lines.
function parseRoles(body) {
  const roles = [];
  for (const line of body.split(/\r?\n/)) {
    const m = /^-[ \t]+(.+?)[ \t]+—[ \t]+(.+)$/.exec(line.trim());
    if (m) roles.push({ name: m[1].trim(), role: m[2].trim() });
  }
  return roles;
}

// ─── file-kind + trust ladder (teams add an `external_sources` rung) ─
const SCRIPT_EXT = /\.(sh|bash|zsh|py|js|mjs|cjs|ts|rb|pl|ps1|bat|cmd)$/i;
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|pdf|mp4|mov|webm|zip|tar|gz|bin|woff2?|ttf)$/i;
function deriveTrustLevel(paths) {
  let hasAsset = false;
  for (const p of paths) {
    if (/^scripts?\//i.test(p) || SCRIPT_EXT.test(p)) return "scripts_executables";
    if (/^assets?\//i.test(p) || ASSET_EXT.test(p)) hasAsset = true;
  }
  return hasAsset ? "assets" : "markdown_only";
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UNSAFE_PATH_RE = /(^\/|^[a-zA-Z]:|\.\.(?:\/|\\|$)|\/\/|\\)/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function main() {
  if (!existsSync(CATALOG_DIR)) {
    console.error(`catalog dir not found: ${CATALOG_DIR}`);
    process.exit(1);
  }
  const catalogRef = existsSync(REF_FILE) ? JSON.parse(readFileSync(REF_FILE, "utf8")) : null;
  const repo = catalogRef?.repo ?? "unknown/teams-catalog";
  const pinRef = catalogRef?.commit || catalogRef?.ref || "bundled";

  const teamDirs = new Map(); // slugDir -> { slug, files: [{path, abs}] }
  for (const file of walk(CATALOG_DIR)) {
    const rel = relative(CATALOG_DIR, file).split(sep);
    if (rel.length < 2) continue; // <slug>/<file...>
    const [slug] = rel;
    const slugDir = join(CATALOG_DIR, slug);
    const relInTeam = relative(slugDir, file).split(sep).join("/");
    if (!teamDirs.has(slugDir)) teamDirs.set(slugDir, { slug, files: [] });
    teamDirs.get(slugDir).files.push({ path: relInTeam, abs: file });
  }

  const errors = [];
  const teams = [];
  for (const { slug, files } of teamDirs.values()) {
    if (!SLUG_RE.test(slug)) errors.push(`${slug}: directory name is not a valid slug`);
    const built = files
      .map((f) => ({ path: f.path, content: readFileSync(f.abs, "utf8") }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const manifest = built.find((f) => /(^|\/)TEAM\.md$/i.test(f.path));
    if (!manifest) {
      errors.push(`${slug}: no TEAM.md`);
      continue;
    }
    for (const f of built) {
      if (UNSAFE_PATH_RE.test(f.path)) errors.push(`${slug}/${f.path}: file path is unsafe`);
    }
    const fm = parseFrontmatter(manifest.content) ?? {};
    if (!fm.name || typeof fm.name !== "string") errors.push(`${slug}: frontmatter is missing 'name'`);
    if (typeof fm.slug === "string" && fm.slug !== slug)
      errors.push(`${slug}: frontmatter slug '${fm.slug}' != directory '${slug}'`);
    const roles = parseRoles(splitFrontmatter(manifest.content).body);
    if (roles.length === 0) errors.push(`${slug}: TEAM.md has no roles`);

    const outFiles = built.map((f) => ({ path: f.path, sha256: sha256(f.content), content: f.content }));
    const contentHash = sha256(outFiles.map((f) => `${f.path}:${f.sha256}`).join("\n"));
    teams.push({
      id: `team_${slug.replace(/-/g, "_")}`,
      slug,
      key: typeof fm.key === "string" && fm.key ? fm.key : slug,
      name: String(fm.name ?? slug),
      description: String(fm.description ?? ""),
      tagline: String(fm.tagline ?? ""),
      icon: typeof fm.icon === "string" ? fm.icon : null,
      author: typeof fm.author === "string" ? fm.author : null,
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      trustLevel: deriveTrustLevel(outFiles.map((f) => f.path)),
      roles,
      sourceRef: `github:${repo}@${pinRef}#sha256:${contentHash}`,
      contentHash,
      files: outFiles,
    });
  }

  if (errors.length) {
    console.error("teams catalog build failed:\n  - " + errors.join("\n  - "));
    process.exit(1);
  }

  teams.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    packageName: pkg.name,
    packageVersion: pkg.version,
    catalogRef,
    teams,
  };
  const json = JSON.stringify(manifest, sortedKeys, 2) + "\n";
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, json);
  console.log(
    `wrote ${relative(process.cwd(), OUT_FILE)} — ${teams.length} teams, ` +
      `${teams.reduce((n, t) => n + t.roles.length, 0)} roles`,
  );
}

function sortedKeys(_key, value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value)
      .sort()
      .reduce((acc, k) => ((acc[k] = value[k]), acc), {});
  }
  return value;
}

main();
