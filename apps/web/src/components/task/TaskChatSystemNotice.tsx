"use client";

import { useId, useState } from "react";
import {
  ChevronDown,
  CircleCheck,
  Clock,
  Info,
  MessageSquare,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownWithMentions } from "../common/MarkdownWithMentions";
import { TimeAgo } from "../common/TimeAgo";
import {
  type HumanizedSystemNotice,
  type SystemNoticeIcon,
  type SystemNoticeTone,
} from "@/lib/system-notice-humanizer";

const ICON: Record<SystemNoticeIcon, LucideIcon> = {
  "check-circle": CircleCheck,
  "alert-triangle": TriangleAlert,
  clock: Clock,
  "message-square": MessageSquare,
  info: Info,
};

/** Tone → color tokens (light/dark safe; sourced from globals.css design tokens). */
const TONE_TEXT: Record<SystemNoticeTone, string> = {
  info: "text-primary",
  success: "text-success",
  warning: "text-warning",
};
const TONE_ICON_BG: Record<SystemNoticeTone, string> = {
  info: "bg-primary/10",
  success: "bg-success-muted",
  warning: "bg-warning-muted",
};

/**
 * Compact, humanized system/recovery notice row for the task chat (port of
 * Paperclip #11075). Collapsed, it reads as a quiet centered one-liner — tone
 * icon + plain-English title + optional detail + relative time + chevron —
 * instead of a large raw markdown block. Expanding reveals the full original
 * body; nothing is suppressed, only folded.
 */
export function TaskChatSystemNotice({
  notice,
  rawContent,
  createdAt,
}: {
  notice: HumanizedSystemNotice;
  rawContent: string;
  createdAt: string;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const ToneIcon = ICON[notice.icon] ?? Info;

  return (
    <div className="flex flex-col items-center py-1" data-testid="task-chat-system-notice">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={detailsId}
        className={cn(
          "flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted-foreground",
          "hover:bg-muted/60 hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        )}
      >
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
            TONE_ICON_BG[notice.tone],
          )}
        >
          <ToneIcon className={cn("h-3.5 w-3.5", TONE_TEXT[notice.tone])} aria-hidden />
        </span>
        <span className={cn("truncate font-medium", TONE_TEXT[notice.tone])}>{notice.title}</span>
        {notice.detail ? (
          <span className="hidden truncate text-muted-foreground sm:inline">· {notice.detail}</span>
        ) : null}
        <TimeAgo date={createdAt} className="shrink-0 text-muted-foreground/70" tooltip={false} />
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id={detailsId}
          data-testid="task-chat-system-notice-details"
          className="mt-1.5 w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-muted/30 text-left text-sm dark:bg-muted/15"
        >
          <div className="px-3 py-2.5 text-foreground/90">
            <MarkdownWithMentions content={rawContent} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
