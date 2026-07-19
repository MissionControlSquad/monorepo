/**
 * Skill frontmatter (Domain 5 GAP-A). Pure, shared via @agentcenter/utils. Parses the YAML-ish
 * frontmatter block of a `SKILL.md` (the Paperclip skill contract) into a typed record, and classifies
 * bundle files by kind so the trust ladder can be derived. No dependency on a YAML library — a minimal
 * subset parser (scalars, inline `[a, b]` lists, and block `- item` lists) covers the skill schema.
 */

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  key?: string;
  slug?: string;
  recommendedForRoles?: string[];
  requires?: string[];
  tags?: string[];
  defaultInstall?: boolean;
  /** Any other scalar keys, preserved. */
  [extra: string]: string | string[] | boolean | undefined;
}

function coerceScalar(raw: string): string | boolean {
  const v = raw.trim().replace(/^["']|["']$/g, "");
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function parseInlineList(raw: string): string[] {
  return raw
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

/**
 * Pure: extract the leading `---` fenced frontmatter block. Returns `{ frontmatter, body }`; when there
 * is no frontmatter, `frontmatter` is null and `body` is the original text unchanged.
 */
export function splitFrontmatter(markdown: string): { raw: string | null; body: string } {
  const text = markdown ?? "";
  const m = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/.exec(text);
  if (!m) return { raw: null, body: text };
  return { raw: m[1], body: m[2] ?? "" };
}

/** Pure: parse a skill's frontmatter into a typed record. Returns null when there is no frontmatter. */
export function parseSkillFrontmatter(markdown: string): SkillFrontmatter | null {
  const { raw } = splitFrontmatter(markdown);
  if (raw === null) return null;

  const out: SkillFrontmatter = {};
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const kv = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1];
    const rest = kv[2];

    if (rest.trim() === "") {
      // block list: consume following `- item` lines
      const items: string[] = [];
      while (i + 1 < lines.length && /^[ \t]*-[ \t]+/.test(lines[i + 1])) {
        items.push(lines[++i].replace(/^[ \t]*-[ \t]+/, "").trim().replace(/^["']|["']$/g, ""));
      }
      if (items.length) out[key] = items;
    } else if (rest.trim().startsWith("[")) {
      out[key] = parseInlineList(rest);
    } else {
      out[key] = coerceScalar(rest);
    }
  }
  return out;
}

// ─── File-kind classification + trust ladder (F2/F3) ─────────────────────────

export type SkillFileKind = "skill" | "markdown" | "reference" | "script" | "asset" | "other";

const SCRIPT_EXT = /\.(sh|bash|zsh|py|js|mjs|cjs|ts|rb|pl|ps1|bat|cmd)$/i;
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|pdf|mp4|mov|webm|zip|tar|gz|bin|woff2?|ttf)$/i;

/** Pure: classify a bundle file by its path, mirroring Paperclip's classifyCatalogFile. */
export function classifySkillFile(path: string): SkillFileKind {
  const p = path.trim();
  const lower = p.toLowerCase();
  if (lower === "skill.md") return "skill";
  if (/^(references?|reference)\//i.test(p)) return "reference";
  if (/^scripts?\//i.test(p) || SCRIPT_EXT.test(p)) return "script";
  if (/^assets?\//i.test(p) || ASSET_EXT.test(p)) return "asset";
  if (/\.(md|mdx|markdown)$/i.test(lower)) return "markdown";
  return "other";
}

export type SkillTrustLevel = "markdown_only" | "assets" | "scripts_executables";

/**
 * Pure: derive the trust ladder from the file kinds in a bundle. Any script/executable → the highest
 * rung; any asset → middle; otherwise markdown-only. Mirrors Paperclip's deriveTrustLevel.
 */
export function deriveSkillTrustLevel(paths: string[]): SkillTrustLevel {
  let hasAsset = false;
  for (const path of paths) {
    const kind = classifySkillFile(path);
    if (kind === "script") return "scripts_executables";
    if (kind === "asset") hasAsset = true;
  }
  return hasAsset ? "assets" : "markdown_only";
}
