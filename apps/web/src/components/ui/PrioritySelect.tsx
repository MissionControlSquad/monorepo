"use client";

import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { Priority, type PriorityValue } from "@/server/constants";

interface PrioritySelectProps {
  value?: PriorityValue;
  onChange?: (priority: PriorityValue) => void;
  interactive?: boolean;
  disabled?: boolean;
}

const PRIORITIES: {
  id: PriorityValue;
  label: string;
  color: string;
  activeColor: string;
}[] = [
  {
    id: Priority.LOW,
    label: "Low",
    color: "text-muted-foreground",
    activeColor: "bg-muted text-foreground",
  },
  {
    id: Priority.MEDIUM,
    label: "Medium",
    color: "text-warning",
    activeColor: "bg-warning-muted text-warning",
  },
  {
    id: Priority.HIGH,
    label: "High",
    color: "text-destructive",
    activeColor: "bg-destructive-muted text-destructive",
  },
  {
    id: Priority.URGENT,
    label: "Urgent",
    color: "text-rose-600",
    activeColor: "bg-rose-100 text-rose-800",
  },
];

export function PrioritySelect({ value, onChange, interactive, disabled }: PrioritySelectProps) {
  const current = PRIORITIES.find((p) => p.id === value);

  if (interactive && onChange && !disabled) {
    return (
      <Select value={value} onValueChange={(v) => onChange(v as PriorityValue)}>
        <SelectTrigger
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border-0 px-2.5 py-1 text-xs font-medium shadow-none h-auto w-fit",
            current ? current.activeColor : "bg-muted text-muted-foreground",
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="min-w-[10rem]">
          {PRIORITIES.map((p) => (
            <SelectItem key={p.id} value={p.id} className="text-xs">
              <Flag className={cn("size-3", p.color)} />
              <span>{p.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (!current) return <span className="text-sm text-muted-foreground">None</span>;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        current.activeColor,
      )}
    >
      <Flag className={cn("size-3", current.color)} />
      {current.label}
    </span>
  );
}
