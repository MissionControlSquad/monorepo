"use client";

import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  GitPullRequestArrow,
  FileText,
  Info,
  MessageSquareQuote,
} from "lucide-react";
import { Tooltip } from "../ui";
import { MarkdownWithMentions } from "../common/MarkdownWithMentions";
import type { MessagePresentation, MessageAnnotationOrigin } from "@agentcenter/types";

/**
 * Work-items §3 — richer comment rendering.
 *
 *  • MessagePresentationCard renders a structured system-authored comment (run summary / status change /
 *    deliverable reference) as a compact accented card with a readable label. A message with no
 *    `presentation` (plain human/agent chat) never reaches this component — the caller falls back to the
 *    ordinary bubble.
 *  • AnnotationOriginBadge marks a comment that was mirrored from a document annotation, with a tooltip
 *    showing the annotated quote and a link to the annotated doc/region.
 */

const TONE: Record<MessagePresentation["tone"], { accent: string; chip: string; icon: string }> = {
  success: {
    accent: "border-l-success",
    chip: "bg-success-muted text-success",
    icon: "text-success",
  },
  warning: {
    accent: "border-l-warning",
    chip: "bg-warning-muted text-warning",
    icon: "text-warning",
  },
  info: {
    accent: "border-l-indigo-400",
    chip: "bg-indigo-50 text-indigo-700",
    icon: "text-indigo-600",
  },
  neutral: {
    accent: "border-l-border",
    chip: "bg-muted text-muted-foreground",
    icon: "text-muted-foreground",
  },
};

/** Human-readable label per kind, shown as the card's category chip. */
const KIND_LABEL: Record<MessagePresentation["kind"], string> = {
  run_summary: "Agent run",
  status_change: "Status update",
  deliverable_ref: "Deliverable",
  note: "Note",
  system: "System",
};

function KindIcon({ p, className }: { p: MessagePresentation; className?: string }) {
  const common = { className, "aria-hidden": true } as const;
  if (p.kind === "run_summary") {
    if (p.status === "timeout") return <Clock {...common} />;
    if (p.tone === "success") return <CheckCircle2 {...common} />;
    return <AlertTriangle {...common} />;
  }
  if (p.kind === "status_change") {
    if (p.tone === "success") return <CheckCircle2 {...common} />;
    if (p.tone === "warning") return <AlertTriangle {...common} />;
    return <GitPullRequestArrow {...common} />;
  }
  if (p.kind === "deliverable_ref") return <FileText {...common} />;
  return <Info {...common} />;
}

export function MessagePresentationCard({
  presentation,
  content,
}: {
  presentation: MessagePresentation;
  content: string;
}) {
  const tone = TONE[presentation.tone] ?? TONE.neutral;
  return (
    <div
      className={`rounded-md border border-border border-l-2 ${tone.accent} bg-card/50 p-3`}
      data-presentation-kind={presentation.kind}
      data-testid="message-presentation-card"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <KindIcon p={presentation} className={`w-4 h-4 shrink-0 ${tone.icon}`} />
        <span className="text-sm font-semibold text-foreground">{presentation.title}</span>
        <span
          className={`ml-auto inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone.chip}`}
        >
          {KIND_LABEL[presentation.kind] ?? presentation.kind}
        </span>
      </div>
      {presentation.detail && (
        <p className="text-xs text-muted-foreground mb-1.5 break-words">{presentation.detail}</p>
      )}
      <div className="text-sm text-foreground">
        <MarkdownWithMentions content={content} />
      </div>
    </div>
  );
}

export function AnnotationOriginBadge({ origin }: { origin: MessageAnnotationOrigin }) {
  const thread = origin.thread;
  const quote = thread?.quote ?? "";
  const shortQuote = quote.length > 60 ? `${quote.slice(0, 59)}…` : quote;
  const href = thread
    ? `/task?doc=${encodeURIComponent(thread.documentId)}&thread=${encodeURIComponent(thread.id)}`
    : undefined;

  const badge = (
    <span
      className="inline-flex items-center gap-1 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700"
      data-testid="annotation-origin-badge"
    >
      <MessageSquareQuote className="w-3 h-3" aria-hidden />
      From annotation
    </span>
  );

  return (
    <Tooltip
      content={
        <span className="block max-w-[16rem]">
          <span className="block font-medium">Mirrored from a document annotation</span>
          {shortQuote && (
            <span className="mt-0.5 block italic text-muted-foreground">“{shortQuote}”</span>
          )}
          {href && (
            <span className="mt-0.5 block text-indigo-600">Open the annotated document →</span>
          )}
        </span>
      }
    >
      {href ? (
        <a href={href} className="no-underline hover:opacity-80 focus:outline-none">
          {badge}
        </a>
      ) : (
        badge
      )}
    </Tooltip>
  );
}
