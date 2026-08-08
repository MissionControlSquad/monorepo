// Pure presentation helpers for the Memory inspect UI (Domain 4 GAP-D). No React, no I/O - kept
// here so the formatting is unit-tested in isolation from the component that renders it.

export type MemoryBadgeVariant =
  | "gray"
  | "blue"
  | "green"
  | "red"
  | "yellow"
  | "purple"
  | "orange"
  | "indigo";

/** Human labels for a memory op's provenance source kind. */
const SOURCE_KIND_LABELS: Record<string, string> = {
  run: "Run",
  issue: "Issue",
  issue_comment: "Comment",
  issue_document: "Document",
  activity: "Activity",
  manual_note: "Manual note",
  external_document: "External doc",
};

/** Label a provenance source kind ("run" -> "Run"); unknown kinds are returned verbatim. */
export function sourceKindLabel(kind: string | null | undefined): string {
  if (!kind) return "Unknown";
  return SOURCE_KIND_LABELS[kind] ?? kind;
}

/** Shorten an id for display (cuid/uuid) to its last 8 chars, prefixed for readability. */
export function shortId(id: string | null | undefined): string {
  if (!id) return "";
  return id.length <= 8 ? id : `…${id.slice(-8)}`;
}

/**
 * A one-line provenance description for a memory entry: the source kind plus the reference it came
 * from (the originating task/run). Returns "No provenance" when nothing is recorded.
 */
export function formatProvenance(entry: {
  sourceKind?: string | null;
  sourceTaskId?: string | null;
  sourceRefId?: string | null;
}): string {
  const ref = entry.sourceTaskId ?? entry.sourceRefId ?? null;
  if (!entry.sourceKind && !ref) return "No provenance";
  const parts: string[] = [];
  if (entry.sourceKind) parts.push(sourceKindLabel(entry.sourceKind));
  if (entry.sourceTaskId) parts.push(`task ${shortId(entry.sourceTaskId)}`);
  else if (entry.sourceRefId) parts.push(`ref ${shortId(entry.sourceRefId)}`);
  return parts.join(" · ");
}

/**
 * Format a memory op's money cost. `costCents` is an integer count of cents; sub-cent amounts still
 * render (memory ops are usually cheap). Null/undefined -> "-" (no cost attributed).
 */
export function formatMemoryCost(costCents: number | null | undefined): string {
  if (costCents == null) return "-";
  if (costCents === 0) return "$0.00";
  const dollars = costCents / 100;
  // Keep small amounts legible: show up to 4 decimals for sub-cent, 2 otherwise.
  const digits = Math.abs(dollars) < 0.01 ? 4 : 2;
  return `$${dollars.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })}`;
}

/** Format an operation latency in ms as "123 ms" / "1.4 s"; null/undefined -> "-". */
export function formatLatency(ms: number | null | undefined): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} s`;
}

/** Badge color for a memory op type - reads/writes/deletes get distinct hues. */
export function opTypeBadgeVariant(opType: string): MemoryBadgeVariant {
  switch (opType) {
    case "capture":
    case "record_upsert":
      return "green";
    case "query":
    case "list":
    case "get":
      return "blue";
    case "forget":
      return "red";
    case "correct":
      return "orange";
    default:
      return "gray";
  }
}

/** Human label for the cost attribution mode. */
export function attributionLabel(mode: string | null | undefined): string {
  if (!mode) return "Untracked";
  switch (mode) {
    case "billed_directly":
      return "Billed directly";
    case "included_in_run":
      return "Included in run";
    case "external_invoice":
      return "External invoice";
    case "untracked":
      return "Untracked";
    default:
      return mode;
  }
}
