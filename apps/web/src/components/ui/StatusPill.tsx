"use client";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { TASK_STATUSES } from "../../lib/constants";

type StatusId = (typeof TASK_STATUSES)[number]["id"];

interface StatusPillProps {
  status: StatusId;
  interactive?: boolean;
  onChange?: (status: string) => void;
  disabled?: boolean;
}

const STATUS_STYLES: Record<StatusId, { bg: string; text: string; dot: string; activeBg: string }> =
  {
    backlog: {
      bg: "bg-muted",
      text: "text-muted-foreground",
      dot: "bg-slate-400",
      activeBg: "hover:bg-accent",
    },
    inbox: {
      bg: "bg-muted",
      text: "text-foreground",
      dot: "bg-gray-400",
      activeBg: "hover:bg-accent",
    },
    assigned: {
      bg: "bg-blue-50",
      text: "text-blue-700",
      dot: "bg-blue-500",
      activeBg: "hover:bg-blue-100",
    },
    in_progress: {
      bg: "bg-warning-muted",
      text: "text-warning",
      dot: "bg-warning animate-pulse",
      activeBg: "hover:bg-warning/15",
    },
    review: {
      bg: "bg-purple-50",
      text: "text-purple-700",
      dot: "bg-purple-500",
      activeBg: "hover:bg-purple-100",
    },
    done: {
      bg: "bg-success-muted",
      text: "text-success",
      dot: "bg-success",
      activeBg: "hover:bg-success/15",
    },
    blocked: {
      bg: "bg-destructive-muted",
      text: "text-destructive",
      dot: "bg-destructive",
      activeBg: "hover:bg-destructive/15",
    },
  };

export function StatusPill({ status, interactive, onChange, disabled }: StatusPillProps) {
  const statusMeta = TASK_STATUSES.find((s) => s.id === status);
  const style = STATUS_STYLES[status];

  if (!statusMeta || !style) return null;

  if (interactive && onChange && !disabled) {
    return (
      <Select value={status} onValueChange={onChange}>
        <SelectTrigger
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border-0 px-2.5 py-1 text-xs font-medium shadow-none h-auto w-fit",
            style.bg,
            style.text,
            style.activeBg,
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="min-w-[11rem]">
          {TASK_STATUSES.map((s) => {
            const sStyle = STATUS_STYLES[s.id];
            return (
              <SelectItem key={s.id} value={s.id} className="text-xs">
                <span className={cn("size-1.5 rounded-full shrink-0", sStyle.dot)} />
                <span className={sStyle.text}>{s.label}</span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        style.bg,
        style.text,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      {statusMeta.label}
    </span>
  );
}
