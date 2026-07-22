// Portable path helpers (parity #130). OS-agnostic path handling for workspace/repo paths that may be
// authored on one OS and consumed on another (Windows backslashes vs POSIX slashes). Pure, no node:path
// dependency, so it is safe in shared + client code. Always normalizes to forward slashes.

/** Convert any path to forward-slash form (Windows `\` → `/`), collapsing duplicate separators. */
export function toPortablePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

/** True for POSIX-absolute (`/x`) or Windows-absolute (`C:\x`, `C:/x`) paths. */
export function isAbsolutePortable(p: string): boolean {
  return /^\//.test(p) || /^[a-zA-Z]:[\\/]/.test(p);
}

/** Join segments with `/`, dropping empties and collapsing separators. Preserves a leading `/`. */
export function joinPortable(...segments: string[]): string {
  const cleaned = segments
    .map((s, i) => (i === 0 ? toPortablePath(s) : toPortablePath(s).replace(/^\/+/, "")))
    .filter((s) => s.length > 0)
    .join("/");
  return toPortablePath(cleaned);
}

/**
 * Normalize a portable path: resolve `.` and `..` segments without touching the filesystem. A leading
 * `/` (or a Windows drive) is preserved; `..` cannot escape above the root of an absolute path.
 */
export function normalizePortable(p: string): string {
  const portable = toPortablePath(p);
  const driveMatch = portable.match(/^([a-zA-Z]:)(\/?)/);
  const drive = driveMatch ? driveMatch[1] : "";
  const rest = drive ? portable.slice(drive.length) : portable;
  const absolute = rest.startsWith("/");

  const out: string[] = [];
  for (const seg of rest.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else if (!absolute) out.push("..");
      continue;
    }
    out.push(seg);
  }
  const body = out.join("/");
  if (drive) return `${drive}${absolute ? "/" : ""}${body}`;
  return absolute ? `/${body}` : body || ".";
}
