// Workspace-file resource refs (parity #172). A `workspace_file` resourceRef points a deliverable at a
// location inside a live checkout: a repo-relative path plus optional line/column, resolved against the
// run's execution/project workspace. Pure and portable (builds on ./portable-path); the deliverable
// system stores the ref and resolves it against a base path when a workspace exists. No I/O here.

import { toPortablePath, isAbsolutePortable, joinPortable, normalizePortable } from "./portable-path";

export interface WorkspaceFileRef {
  kind: "workspace_file";
  relativePath: string; // repo-relative, portable (forward slashes), never absolute, never escaping root
  line?: number; // 1-based
  col?: number; // 1-based
  executionWorkspaceId?: string; // which checkout this resolves against, when known
}

export class WorkspaceFileRefError extends Error {}

/** True when a normalized portable path stays within its root (no leading `..`). */
function staysInsideRoot(relative: string): boolean {
  return !normalizePortable(relative).startsWith("..");
}

/**
 * Build a validated `workspace_file` ref. Rejects absolute paths and any path that escapes the checkout
 * root via `..`. Line/col, when given, must be positive integers (1-based).
 */
export function makeWorkspaceFileRef(input: {
  relativePath: string;
  line?: number | null;
  col?: number | null;
  executionWorkspaceId?: string | null;
}): WorkspaceFileRef {
  const raw = (input.relativePath ?? "").trim();
  if (!raw) throw new WorkspaceFileRefError("relativePath is required");
  const portable = toPortablePath(raw).replace(/^\.\//, "");
  if (isAbsolutePortable(portable))
    throw new WorkspaceFileRefError("relativePath must be repo-relative, not absolute");
  if (!staysInsideRoot(portable))
    throw new WorkspaceFileRefError("relativePath must not escape the workspace root");

  const ref: WorkspaceFileRef = { kind: "workspace_file", relativePath: portable };
  if (input.line != null) {
    if (!Number.isInteger(input.line) || input.line < 1)
      throw new WorkspaceFileRefError("line must be a positive integer");
    ref.line = input.line;
  }
  if (input.col != null) {
    if (!Number.isInteger(input.col) || input.col < 1)
      throw new WorkspaceFileRefError("col must be a positive integer");
    if (ref.line == null) throw new WorkspaceFileRefError("col requires a line");
    ref.col = input.col;
  }
  if (input.executionWorkspaceId) ref.executionWorkspaceId = input.executionWorkspaceId;
  return ref;
}

/** Display form: `path`, `path:line`, or `path:line:col`. */
export function formatWorkspaceFileRef(ref: WorkspaceFileRef): string {
  if (ref.line == null) return ref.relativePath;
  if (ref.col == null) return `${ref.relativePath}:${ref.line}`;
  return `${ref.relativePath}:${ref.line}:${ref.col}`;
}

/** Parse a `path:line:col` display string back into a validated ref (line/col optional). */
export function parseWorkspaceFileRef(input: string): WorkspaceFileRef {
  const raw = (input ?? "").trim();
  if (!raw) throw new WorkspaceFileRefError("empty ref");
  // Peel a trailing `:line` and `:line:col`, but leave Windows drive colons (`C:`) alone — those are
  // rejected downstream as absolute anyway.
  const m = raw.match(/^(.*?)(?::(\d+))?(?::(\d+))?$/);
  if (!m) throw new WorkspaceFileRefError(`unparseable ref: ${input}`);
  const [, path, line, col] = m;
  return makeWorkspaceFileRef({
    relativePath: path,
    line: line ? Number(line) : null,
    col: col ? Number(col) : null,
  });
}

/**
 * Resolve the ref to a concrete portable path under a checkout base. Re-checks containment after the
 * join so a caller cannot smuggle an escape through the base. Returns the file path only (line/col are
 * carried separately on the ref).
 */
export function resolveWorkspaceFilePath(ref: WorkspaceFileRef, basePath: string): string {
  const joined = normalizePortable(joinPortable(basePath, ref.relativePath));
  const base = normalizePortable(basePath);
  const withinBase =
    joined === base || joined.startsWith(base.endsWith("/") ? base : `${base}/`);
  if (!withinBase)
    throw new WorkspaceFileRefError("resolved path escapes the workspace base");
  return joined;
}
