/**
 * Pure .env parser for the secrets vault bulk-import path (Epic #5). Import from @agentcenter/utils.
 * Parses `KEY=VALUE` lines (optional `export ` prefix, `#` comments, quoted values) into name/value
 * pairs. It never touches the DB and never logs — plaintext values only pass through the return.
 */
export interface DotEnvEntry {
  name: string;
  value: string;
}
export interface ParsedDotEnv {
  entries: DotEnvEntry[];
  /** 1-based line numbers that were non-blank/non-comment but not valid `KEY=VALUE`. */
  invalidLines: number[];
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Strip one layer of matching single/double quotes around a value. */
function unquote(v: string): string {
  if (v.length >= 2) {
    const first = v[0];
    if ((first === '"' || first === "'") && v[v.length - 1] === first) {
      return v.slice(1, -1);
    }
  }
  return v;
}

export function parseDotEnv(text: string): ParsedDotEnv {
  const entries: DotEnvEntry[] = [];
  const invalidLines: number[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return; // blank or comment
    const body = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eq = body.indexOf("=");
    if (eq <= 0) {
      invalidLines.push(i + 1);
      return;
    }
    const name = body.slice(0, eq).trim();
    if (!KEY_RE.test(name)) {
      invalidLines.push(i + 1);
      return;
    }
    entries.push({ name, value: unquote(body.slice(eq + 1).trim()) });
  });
  return { entries, invalidLines };
}
