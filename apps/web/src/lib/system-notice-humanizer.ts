/**
 * System-notice humanizer (port of Paperclip #11075).
 *
 * The task timeline mixes human chat with machine-authored recovery / system
 * notices — sandbox run outcomes (`sandbox-run.ts` → `postRunToTask`) and
 * review decisions (`review.ts`). Those are posted as raw text blocks that
 * bury the headline (run status, exit code, failure reason) inside markdown.
 *
 * This is a React-free, pure classifier: it maps a raw message body to a short
 * structured notice — `{ kind, icon, title, detail, tone }` — that the chat
 * shell renders as one compact, humanized row with the full body available on
 * expand. Nothing is suppressed, only folded.
 *
 * Returning `null` means "this is not a recognized system notice" — the caller
 * falls back to rendering the message as an ordinary chat bubble. Unknown /
 * custom machine text therefore passes through untouched (raw-text fallback),
 * which is the safe default when a kind is not recognized.
 */

/** Tone drives the icon + color token. Only these three, per the design. */
export type SystemNoticeTone = "info" | "warning" | "success";

/**
 * Icon identifier — a plain string so this module stays React-free. The
 * presentational component maps it to a concrete lucide icon.
 */
export type SystemNoticeIcon =
  "check-circle" | "alert-triangle" | "clock" | "message-square" | "info";

/** Stable machine kind of a recognized notice (useful for tests + telemetry). */
export type SystemNoticeKind =
  | "run_completed"
  | "run_failed"
  | "run_timed_out"
  | "run_error"
  | "task_approved"
  | "changes_requested"
  | "clarification_requested";

export interface HumanizedSystemNotice {
  kind: SystemNoticeKind;
  icon: SystemNoticeIcon;
  title: string;
  /** Optional muted trailing snippet (provider, exit code, first reason line). */
  detail?: string;
  tone: SystemNoticeTone;
}

const DETAIL_MAX_CHARS = 80;

/** Collapse a body to a short single-line snippet, truncated with an ellipsis. */
function shortSnippet(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return undefined;
  if (line.length <= DETAIL_MAX_CHARS) return line;
  return `${line.slice(0, DETAIL_MAX_CHARS - 1).trimEnd()}…`;
}

/**
 * Header of a sandbox-run timeline post. Two shapes are produced upstream:
 *   `Sandbox run (<provider>) — <status>[, exit <code>]` (outcome)
 *   `Sandbox run (<provider>) failed: <message>`         (provision error)
 */
const SANDBOX_OUTCOME = /^Sandbox run \(([^)]+)\) — (\w+)(?:, exit (-?\d+))?/;
const SANDBOX_ERROR = /^Sandbox run \(([^)]+)\) failed: ([\s\S]+)/;

/** Classify a sandbox-run post, or null if the body is not one. */
function classifySandboxRun(body: string): HumanizedSystemNotice | null {
  const errorMatch = body.match(SANDBOX_ERROR);
  if (errorMatch) {
    const [, provider, message] = errorMatch;
    return {
      kind: "run_error",
      icon: "alert-triangle",
      title: "Run could not start",
      detail: shortSnippet(`${provider}: ${message}`),
      tone: "warning",
    };
  }

  const outcome = body.match(SANDBOX_OUTCOME);
  if (!outcome) return null;
  const [, provider, status, exit] = outcome;
  const withExit = (label: string) =>
    exit != null ? `${provider} · ${label} (exit ${exit})` : `${provider} · ${label}`;

  if (status === "timeout") {
    return {
      kind: "run_timed_out",
      icon: "clock",
      title: "Run timed out",
      detail: provider,
      tone: "warning",
    };
  }
  if (status === "done" || exit === "0") {
    return {
      kind: "run_completed",
      icon: "check-circle",
      title: "Run completed",
      detail: provider,
      tone: "success",
    };
  }
  // Any other terminal status (failed, blocked, …) reads as a failure.
  return {
    kind: "run_failed",
    icon: "alert-triangle",
    title: "Run failed",
    detail: withExit("failed"),
    tone: "warning",
  };
}

/** Classify a review-decision post, or null if the body is not one. */
function classifyReview(body: string): HumanizedSystemNotice | null {
  // Approvals: agent path ("Task approved by @x…") and human path ("**Approved** by …").
  if (/^Task approved by\b/.test(body) || /^\*\*Approved\*\*/.test(body)) {
    return { kind: "task_approved", icon: "check-circle", title: "Task approved", tone: "success" };
  }
  // Changes requested: agent path ("**Task rejected**") and human path ("**Changes requested**").
  if (/^\*\*Task rejected\*\*/.test(body) || /^\*\*Changes requested\*\*/.test(body)) {
    const reason = body.match(/\*\*Reason:\*\*\s*([^\n]+)/)?.[1];
    return {
      kind: "changes_requested",
      icon: "alert-triangle",
      title: "Changes requested",
      detail: shortSnippet(reason),
      tone: "warning",
    };
  }
  if (/^\*\*Clarification needed\*\*/.test(body)) {
    return {
      kind: "clarification_requested",
      icon: "message-square",
      title: "Clarification requested",
      tone: "info",
    };
  }
  return null;
}

/**
 * Humanize a raw task-timeline message body. Returns a structured notice for a
 * recognized machine-authored system/recovery notice, or `null` for ordinary
 * chat (the caller then renders the raw body — the unknown-kind passthrough).
 */
export function humanizeSystemNotice(
  body: string | null | undefined,
): HumanizedSystemNotice | null {
  const text = body?.trim();
  if (!text) return null;
  return classifySandboxRun(text) ?? classifyReview(text);
}

/** Convenience predicate: does this body render as a structured system notice? */
export function isSystemNotice(body: string | null | undefined): boolean {
  return humanizeSystemNotice(body) !== null;
}
