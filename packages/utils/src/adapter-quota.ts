/**
 * Concrete provider quota windows for the `claude` runtime (§3 adapters — `getQuotaWindows`).
 *
 * HONEST STATUS — this is BEST-EFFORT, not a live provider API poll. The Claude Code CLI exposes no
 * stable, machine-readable rate-limit/usage endpoint we can call injection-safely from the host, so
 * this reads a KNOWN LOCAL USAGE FILE if one is present (path injected by the server: e.g.
 * `~/.claude/usage.json`, or `$CLAUDE_USAGE_FILE`) and shapes whatever windows it declares. When no such
 * file exists — the common case today — it returns a single EXPLICIT "unknown" window (usedPercent /
 * resetsAt = null, with a detail string that says so) rather than fabricating numbers. `packages/utils`
 * stays pure: the file read is INJECTED via {@link setClaudeUsageReader}; the parse/shape is the pure,
 * fixture-testable half kept here.
 *
 * Recognized file shapes (tolerant): a top-level `rateLimits` or `windows` array of
 * `{ label, used?, limit?, usedPercent?, resetsAt?, detail? }` objects. Anything else → the unknown
 * window. This keeps the door open for a future real telemetry file without pretending one exists now.
 */
import type { ProviderQuotaWindow } from "./adapters";

/** Reader that returns the raw usage-file contents, or null when there is no such file. Injected by the server. */
export type ClaudeUsageReader = () => Promise<string | null> | string | null;

/** The explicit, honest "we don't know" window returned when no usage telemetry is available. */
export const CLAUDE_UNKNOWN_QUOTA_WINDOW: ProviderQuotaWindow = {
  label: "usage (unknown)",
  usedPercent: null,
  resetsAt: null,
  valueLabel: null,
  detail:
    "Claude Code exposes no machine-readable quota window on this host — reported as unknown (best-effort). Set CLAUDE_USAGE_FILE to a usage JSON to surface real windows.",
};

let usageReader: ClaudeUsageReader | null = null;

/** Register (or clear with null) the process-bound usage-file reader. Called once by the server at startup. */
export function setClaudeUsageReader(reader: ClaudeUsageReader | null): void {
  usageReader = reader;
}

/** The currently-registered reader (mostly for tests/introspection). */
export function getClaudeUsageReader(): ClaudeUsageReader | null {
  return usageReader;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Shape one raw usage-file entry into a {@link ProviderQuotaWindow}, or null when it carries no label. */
function shapeWindow(raw: unknown): ProviderQuotaWindow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const label = str(r.label);
  if (!label) return null;
  const used = num(r.used);
  const limit = num(r.limit);
  const explicitPercent = num(r.usedPercent);
  const usedPercent =
    explicitPercent !== null
      ? Math.max(0, Math.min(100, explicitPercent))
      : used !== null && limit !== null && limit > 0
        ? Math.max(0, Math.min(100, Math.round((used / limit) * 100)))
        : null;
  const valueLabel =
    str(r.valueLabel) ??
    (used !== null && limit !== null
      ? `${used.toLocaleString()} / ${limit.toLocaleString()}`
      : null);
  return {
    label,
    usedPercent,
    resetsAt: str(r.resetsAt),
    valueLabel,
    detail: str(r.detail),
  };
}

/**
 * PURE: parse a raw Claude usage-file string into quota windows. Tolerant of a `rateLimits`/`windows`
 * array; unparseable/absent/empty input → the single explicit {@link CLAUDE_UNKNOWN_QUOTA_WINDOW}. Never
 * throws — a corrupt file degrades to "unknown", never an error.
 */
export function parseClaudeQuotaWindows(raw: string | null | undefined): ProviderQuotaWindow[] {
  if (!raw) return [CLAUDE_UNKNOWN_QUOTA_WINDOW];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [CLAUDE_UNKNOWN_QUOTA_WINDOW];
  }
  const obj = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const arr = Array.isArray(obj.rateLimits)
    ? obj.rateLimits
    : Array.isArray(obj.windows)
      ? obj.windows
      : null;
  if (!arr) return [CLAUDE_UNKNOWN_QUOTA_WINDOW];
  const windows = arr.map(shapeWindow).filter((w): w is ProviderQuotaWindow => w !== null);
  return windows.length ? windows : [CLAUDE_UNKNOWN_QUOTA_WINDOW];
}

/**
 * The claude adapter's `getQuotaWindows` implementation: read the injected usage file (best-effort) and
 * shape it. No reader registered / read fails → the explicit unknown window. Never throws to the
 * fan-out (`fetchAllProviderQuota` also timeout-guards + shapes failures).
 */
export async function claudeQuotaWindows(): Promise<ProviderQuotaWindow[]> {
  let raw: string | null = null;
  if (usageReader) {
    try {
      raw = await usageReader();
    } catch {
      raw = null;
    }
  }
  return parseClaudeQuotaWindows(raw);
}
