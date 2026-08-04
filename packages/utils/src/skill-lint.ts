/**
 * Pure skill "test-run": static validation of a skill bundle before publish/assign (Epic #10).
 * Import from @agentcenter/utils. This does NOT execute anything (no agent-runtime engine) — it
 * lints the entry markdown + bundle files for structural problems, the way a linter would.
 */
import { parseSkillFrontmatter } from "./skill-frontmatter";

export type SkillLintLevel = "error" | "warn";
export interface SkillLintFinding {
  level: SkillLintLevel;
  /** File path the finding is about, or null for the entry doc / whole bundle. */
  path: string | null;
  message: string;
}

export interface SkillLintInput {
  markdown: string;
  files: { path: string; content: string }[];
  /** When true, enforce the SKILL.md frontmatter contract (name/description/slug). Off by default so
   * free-text authored skills still lint clean; catalog/imported skills opt in. */
  requireFrontmatter?: boolean;
}

const MAX_ENTRY_BYTES = 100_000; // ~100 KB entry doc
const MAX_BUNDLE_BYTES = 1_000_000; // ~1 MB total
const MAX_FILE_BYTES = 100_000; // ~100 KB per bundle file
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A path that escapes the bundle root (traversal) or is absolute — never allowed. */
const UNSAFE_PATH_RE = /(^\/|^[a-zA-Z]:|\.\.(?:\/|\\|$)|\/\/|\\)/;
const bytes = (s: string): number => {
  // Byte length without Buffer/TextEncoder assumptions: count UTF-16 + surrogate weight roughly.
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
  }
  return n;
};

/**
 * Pure: return lint findings for a skill bundle. An empty array means it passed. `error` findings are
 * blockers (empty entry doc, duplicate/empty files); `warn` findings are advisory (no title, size).
 */
export function lintSkill(input: SkillLintInput): SkillLintFinding[] {
  const findings: SkillLintFinding[] = [];
  const md = input.markdown ?? "";

  if (!md.trim()) {
    findings.push({ level: "error", path: null, message: "entry doc (markdown) is empty" });
  } else {
    if (!/^\s*#\s+\S/m.test(md))
      findings.push({ level: "warn", path: null, message: "entry doc has no '# Title' heading" });
    if (bytes(md) > MAX_ENTRY_BYTES)
      findings.push({
        level: "warn",
        path: null,
        message: `entry doc is large (> ${Math.round(MAX_ENTRY_BYTES / 1000)} KB)`,
      });
  }

  // Frontmatter contract (GAP-A): name + description required, slug well-formed. Only enforced when
  // the caller opts in (catalog/imported skills); otherwise a missing block is fine.
  const fm = parseSkillFrontmatter(md);
  if (input.requireFrontmatter) {
    if (!fm) {
      findings.push({ level: "error", path: null, message: "SKILL.md is missing YAML frontmatter" });
    } else {
      if (!fm.name || typeof fm.name !== "string")
        findings.push({ level: "error", path: null, message: "frontmatter is missing 'name'" });
      if (!fm.description || typeof fm.description !== "string")
        findings.push({
          level: "error",
          path: null,
          message: "frontmatter is missing 'description'",
        });
      if (typeof fm.slug === "string" && fm.slug && !SLUG_RE.test(fm.slug))
        findings.push({
          level: "error",
          path: null,
          message: `frontmatter 'slug' must match ${SLUG_RE.source}`,
        });
    }
  } else if (fm && typeof fm.slug === "string" && fm.slug && !SLUG_RE.test(fm.slug)) {
    // even when not required, a present-but-malformed slug is worth a warning
    findings.push({ level: "warn", path: null, message: "frontmatter 'slug' is not a valid slug" });
  }

  const seen = new Set<string>();
  let total = bytes(md);
  for (const f of input.files) {
    total += bytes(f.content);
    const path = f.path.trim();
    if (UNSAFE_PATH_RE.test(path))
      findings.push({
        level: "error",
        path,
        message: "file path is unsafe (absolute or escapes the bundle root)",
      });
    if (seen.has(path))
      findings.push({ level: "error", path, message: "duplicate file path in bundle" });
    seen.add(path);
    if (!f.content.trim()) findings.push({ level: "warn", path, message: "file is empty" });
    if (bytes(f.content) > MAX_FILE_BYTES)
      findings.push({
        level: "warn",
        path,
        message: `file is large (> ${Math.round(MAX_FILE_BYTES / 1000)} KB)`,
      });
  }
  if (total > MAX_BUNDLE_BYTES)
    findings.push({
      level: "warn",
      path: null,
      message: `bundle is large (> ${Math.round(MAX_BUNDLE_BYTES / 1000)} KB total)`,
    });

  return findings;
}
