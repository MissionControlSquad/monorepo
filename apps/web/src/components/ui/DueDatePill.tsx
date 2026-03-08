"use client";

import { Calendar } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface DueDatePillProps {
  dueDate: number | string | Date;
  isDone?: boolean;
}

export function DueDatePill({ dueDate, isDone }: DueDatePillProps) {
  const due = new Date(dueDate);
  const diff = due.getTime() - Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const isOverdue = diff < 0 && !isDone;
  const isDueSoon = !isOverdue && diff < 2 * dayMs && !isDone;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
        isOverdue
          ? "bg-destructive-muted text-destructive"
          : isDueSoon
            ? "bg-warning-muted text-warning"
            : "bg-muted text-foreground",
      )}
    >
      <Calendar
        className={cn(
          "size-3",
          isOverdue ? "text-destructive" : isDueSoon ? "text-warning" : "text-muted-foreground",
        )}
      />
      {format(due, "MMM d, yyyy")}
      {isOverdue && <span className="text-[10px] font-semibold">Overdue</span>}
      {isDueSoon && <span className="text-[10px] font-semibold">Soon</span>}
    </span>
  );
}
