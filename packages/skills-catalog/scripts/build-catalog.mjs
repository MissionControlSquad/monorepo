#!/usr/bin/env node
/**
 * build-catalog — walk the in-repo skills catalog tree and emit the content-addressed manifest.
 *
 * HOW TO RUN
 *   node packages/skills-catalog/scripts/build-catalog.mjs      # from the repo root
 *   npm run catalog:build                                       # equivalent, from anywhere
 *
 * WHAT IT DOES
 *   1. Walks `catalog/<tier>/<category>/<slug>/` where tier ∈ {bundled, optional}.
 *   2. Parses + lints each `SKILL.md` (frontmatter contract + bundle safety — the same rules as
 *      `@agentcenter/utils` `skill-lint`/`skill-frontmatter`, reimplemented here so the build runs on
 *      plain `node` with zero dependencies). Any lint ERROR fails the build.
 *   3. Content-addresses every file (sha256) and every skill (`contentHash` over its files), derives the
 *      trust ladder, and writes `generated/catalog.json`.
 *
 * REPRODUCIBLE: no timestamps, no machine paths, keys emitted in a fixed sorted order, skills sorted by
 * id, files sorted by path. Re-running with unchanged inputs produces a byte-identical file (no diff).
 *
 * PROVENANCE: the app loads `generated/catalog.json` and stamps each install with `packageName` +
 * `contentHash` + `sourceRef: catalog:<id>` (see apps/web/src/server/skill-catalog/manifest.ts).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join, relative, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
// Defaults ship the in-repo catalog; env overrides let tests point at a fixture tree/output.
const CATALOG_DIR = process.env.SKILLS_CATALOG_SRC || join(PKG_DIR, "catalog");
const OUT_FILE = process.env.SKILLS_CATALOG_OUT || join(PKG_DIR, "generated", "catalog.json");
const REF_FILE = process.env.SKILLS_CATALOG_REF || join(PKG_DIR, "catalog-ref.json");

const pkg = JSON.parse(readFileSync(join(PKG_DIR, "package.json"), "utf8"));
const SCHEMA_VERSION = 1;

// ─── content hashing ────────────────────────────────────────────────
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

// ─── file-kind + trust ladder (mirrors skill-frontmatter) ────────────
const SCRIPT_EXT = /\.(sh|bash|zsh|py|js|mjs|cjs|ts|rb|pl|ps1|bat|cmd)$/i;
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|pdf|mp4|mov|webm|zip|tar|gz|bin|woff2?|ttf)$/i;
function classifyFile(path) {
  const lower = path.trim().toLowerCase();
  if (lower === "skill.md") return "skill";
  if (/^(references?|reference)\//i.test(path)) return "reference";
  if (/^scripts?\//i.test(path) || SCRIPT_EXT.test(path)) return "script";
  if (/^assets?\//i.test(path) || ASSET_EXT.test(path)) return "asset";
  if (/\.(md|mdx|markdown)$/i.test(lower)) return "markdown";
  return "other";
}
function deriveTrustLevel(paths) {
  let hasAsset = false;
  for (const p of paths) {
    const kind = classifyFile(p);
    if (kind === "script") return "scripts_executables";
    if (kind === "asset") hasAsset = true;
  }
  return hasAsset ? "assets" : "markdown_only";
}

// ─── lint (mirrors @agentcenter/utils skill-lint, requireFrontmatter=true) ─
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UNSAFE_PATH_RE = /(^\/|^[a-zA-Z]:|\.\.(?:\/|\\|$)|\/\/|\\)/;
function lintSkill(markdown, files) {
  const findings = [];
  const md = markdown ?? "";
  if (!md.trim()) findings.push({ level: "error", message: "entry doc (markdown) is empty" });
  else if (!/^\s*#\s+\S/m.test(md))
    findings.push({ level: "warn", message: "entry doc has no '# Title' heading" });

  const fm = parseFrontmatter(md);
  if (!fm) findings.push({ level: "error", message: "SKILL.md is missing YAML frontmatter" });
  else {
    if (!fm.name || typeof fm.name !== "string")
      findings.push({ level: "error", message: "frontmatter is missing 'name'" });
    if (!fm.description || typeof fm.description !== "string")
      findings.push({ level: "error", message: "frontmatter is missing 'description'" });
    if (typeof fm.slug === "string" && fm.slug && !SLUG_RE.test(fm.slug))
      findings.push({ level: "error", message: `frontmatter 'slug' must match ${SLUG_RE.source}` });
    // catalog-specific: category + a well-formed slug are required for the tree.
    if (!fm.slug || typeof fm.slug !== "string")
      findings.push({ level: "error", message: "frontmatter is missing 'slug'" });
    if (!fm.category || typeof fm.category !== "string")
      findings.push({ level: "error", message: "frontmatter is missing 'category'" });
  }

  const seen = new Set();
  for (const f of files) {
    const path = f.path.trim();
    if (UNSAFE_PATH_RE.test(path))
      findings.push({ level: "error", path, message: "file path is unsafe" });
    if (seen.has(path)) findings.push({ level: "error", path, message: "duplicate file path" });
    seen.add(path);
    if (!f.content.trim()) findings.push({ level: "warn", path, message: "file is empty" });
  }
  return findings;
}

// ─── tree walk ───────────────────────────────────────────────────────
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
  const skillDirs = new Map(); // slugDir(abs) -> { tier, category, slug, files: [{path, abs}] }
  for (const file of walk(CATALOG_DIR)) {
    const rel = relative(CATALOG_DIR, file).split(sep);
    if (rel.length < 4) continue; // <tier>/<category>/<slug>/<file...>
    const [tier, category, slug] = rel;
    if (tier !== "bundled" && tier !== "optional") continue;
    const slugDir = join(CATALOG_DIR, tier, category, slug);
    const relInSkill = relative(slugDir, file).split(sep).join("/");
    if (!skillDirs.has(slugDir)) skillDirs.set(slugDir, { tier, category, slug, files: [] });
    skillDirs.get(slugDir).files.push({ path: relInSkill, abs: file });
  }

  const errors = [];
  const skills = [];
  for (const { tier, category, slug, files } of skillDirs.values()) {
    if (!SLUG_RE.test(slug)) errors.push(`${slug}: directory name is not a valid slug`);
    const built = files
      .map((f) => ({ path: f.path, content: readFileSync(f.abs, "utf8") }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const manifest = built.find((f) => /(^|\/)SKILL\.md$/i.test(f.path));
    if (!manifest) {
      errors.push(`${slug}: no SKILL.md`);
      continue;
    }
    const findings = lintSkill(
      manifest.content,
      built.filter((f) => f !== manifest),
    );
    for (const fd of findings)
      if (fd.level === "error")
        errors.push(`${slug}${fd.path ? `/${fd.path}` : ""}: ${fd.message}`);

    const fm = parseFrontmatter(manifest.content) ?? {};
    if (typeof fm.slug === "string" && fm.slug !== slug)
      errors.push(`${slug}: frontmatter slug '${fm.slug}' != directory '${slug}'`);
    if (typeof fm.category === "string" && fm.category !== category)
      errors.push(`${slug}: frontmatter category '${fm.category}' != directory '${category}'`);

    const outFiles = built.map((f) => ({
      path: f.path,
      sha256: sha256(f.content),
      content: f.content,
    }));
    const contentHash = sha256(outFiles.map((f) => `${f.path}:${f.sha256}`).join("\n"));
    skills.push({
      id: `skl_${slug.replace(/-/g, "_")}`,
      slug,
      key: typeof fm.key === "string" && fm.key ? fm.key : slug,
      name: String(fm.name ?? slug),
      description: String(fm.description ?? ""),
      category,
      tier,
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      recommendedForRoles: Array.isArray(fm.recommendedForRoles) ? fm.recommendedForRoles : [],
      trustLevel: deriveTrustLevel(outFiles.map((f) => f.path)),
      contentHash,
      files: outFiles,
    });
  }

  if (errors.length) {
    console.error("catalog build failed:\n  - " + errors.join("\n  - "));
    process.exit(1);
  }

  skills.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const catalogRef = existsSync(REF_FILE) ? JSON.parse(readFileSync(REF_FILE, "utf8")) : null;

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    packageName: pkg.name,
    packageVersion: pkg.version,
    catalogRef,
    skills,
  };

  // Deterministic serialization: fixed key order via a sorted replacer.
  const json = JSON.stringify(manifest, sortedKeys, 2) + "\n";
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, json);
  console.log(
    `wrote ${relative(process.cwd(), OUT_FILE)} — ${skills.length} skills ` +
      `(${skills.filter((s) => s.tier === "bundled").length} bundled, ` +
      `${skills.filter((s) => s.tier === "optional").length} optional)`,
  );
}

// Stable object-key ordering for reproducible output (arrays keep their order).
function sortedKeys(_key, value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value)
      .sort()
      .reduce((acc, k) => ((acc[k] = value[k]), acc), {});
  }
  return value;
}

main();
