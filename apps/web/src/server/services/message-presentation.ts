/**
 * Work-items §3 Item 2 — rich comment PRESENTATION metadata (pure builders).
 *
 * A task `Message` is plain `content`. Paperclip additionally carries a structured PRESENTATION payload
 * so a system-authored comment (a run outcome, a status transition, a deliverable reference) can render
 * as a richer card instead of a raw text block. This module is the single, React-free source of truth
 * for that payload: it produces the `Message.presentation` JSON the timeline reads.
 *
 * Design:
 *   • `kind` is a small closed set the UI switches on; unknown kinds (or a null presentation) fall back
 *     to plain rendering, so this is always additive and never a correctness dependency.
 *   • builders are pure — same input → same object — so they are trivially unit-testable and safe to
 *     call from any auto-post site (sandbox-run, review, …).
 *   • fields are optional + primitive so the JSON round-trips through Prisma `Json?` unchanged.
 */

export type MessagePresentationKind =
  "note" | "status_change" | "run_summary" | "deliverable_ref" | "system";

/** Tone drives the card's accent color token in the UI. */
export type MessagePresentationTone = "info" | "success" | "warning" | "neutral";

export interface MessagePresentation {
  kind: MessagePresentationKind;
  /** Short, human-readable headline for the card (e.g. "Run completed"). */
  title: string;
  tone: MessagePresentationTone;
  /** Optional muted sub-line (provider, exit code, reviewer, …). */
  detail?: string;
  /** run_summary — the run this comment reports on. */
  runId?: string;
  provider?: string;
  status?: string;
  exitCode?: number | null;
  /** status_change — the task transition this comment records. */
  fromStatus?: string;
  toStatus?: string;
  actor?: string;
  /** deliverable_ref — the produced artifact this comment points at. */
  deliverableId?: string;
}

/** Drop undefined keys so the persisted JSON stays compact and stable across builds. */
function compact(p: MessagePresentation): MessagePresentation {
  return Object.fromEntries(
    Object.entries(p).filter(([, v]) => v !== undefined),
  ) as unknown as MessagePresentation;
}

/**
 * Presentation for a sandbox / gateway run-outcome auto-post. Maps the terminal status to a tone +
 * headline so the timeline card reads at a glance (green completed / amber failed / amber timeout).
 */
export function runSummaryPresentation(input: {
  provider: string;
  status: string;
  exitCode?: number | null;
  runId?: string | null;
}): MessagePresentation {
  const { provider, status, exitCode, runId } = input;
  const completed = status === "done" || status === "review" || exitCode === 0;
  const timedOut = status === "timeout";
  const tone: MessagePresentationTone = completed ? "success" : timedOut ? "warning" : "warning";
  const title = completed ? "Run completed" : timedOut ? "Run timed out" : "Run failed";
  const detail = exitCode != null ? `${provider} · exit ${exitCode}` : provider;
  return compact({
    kind: "run_summary",
    title,
    tone,
    detail,
    provider,
    status,
    exitCode: exitCode ?? null,
    runId: runId ?? undefined,
  });
}

/** Presentation for a run that could not start (provision/config error). */
export function runErrorPresentation(input: {
  provider: string;
  runId?: string | null;
}): MessagePresentation {
  return compact({
    kind: "run_summary",
    title: "Run could not start",
    tone: "warning",
    detail: input.provider,
    provider: input.provider,
    status: "error",
    runId: input.runId ?? undefined,
  });
}

/**
 * Presentation for a task status-transition auto-post (approval → done, changes requested, …). Approvals
 * read as success; everything else is neutral/info so the card doesn't cry wolf.
 */
export function statusChangePresentation(input: {
  fromStatus?: string | null;
  toStatus: string;
  actor?: string | null;
  approved?: boolean;
  detail?: string | null;
}): MessagePresentation {
  const approved = input.approved ?? input.toStatus === "done";
  return compact({
    kind: "status_change",
    title: approved ? "Task approved" : "Status changed",
    tone: approved ? "success" : "info",
    detail:
      input.detail ??
      (input.fromStatus ? `${input.fromStatus} → ${input.toStatus}` : `Moved to ${input.toStatus}`),
    fromStatus: input.fromStatus ?? undefined,
    toStatus: input.toStatus,
    actor: input.actor ?? undefined,
  });
}

/** Presentation for a "changes requested" review auto-post. */
export function changesRequestedPresentation(input: {
  actor?: string | null;
  reason?: string | null;
}): MessagePresentation {
  return compact({
    kind: "status_change",
    title: "Changes requested",
    tone: "warning",
    detail: input.reason ?? undefined,
    actor: input.actor ?? undefined,
  });
}
