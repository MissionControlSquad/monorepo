"use client";

import { useState, useEffect, useCallback, memo } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { Input as ShadcnInput } from "@/components/ui/shadcn/input";
import { Button } from "../ui";
import type { Agent } from "@agentcenter/types";

export type DueDateFilter = "overdue" | "today" | "this_week" | "no_due_date";

export interface FilterState {
  searchQuery: string;
  priorities: string[];
  assigneeIds: string[];
  tags: string[];
  unassignedOnly: boolean;
  noProjectOnly: boolean;
  dueDateFilter: DueDateFilter | null;
  blockedOnly: boolean;
  topLevelOnly: boolean;
}

export type FilterUpdater = FilterState | ((prev: FilterState) => FilterState);

interface FilterBarProps {
  filters: FilterState;
  onFiltersChange: (update: FilterUpdater) => void;
  agents: Agent[];
  onOpenFilters: () => void;
}

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", color: "bg-warning/15 text-warning" },
  high: { label: "High", color: "bg-destructive/15 text-destructive" },
  urgent: { label: "Urgent", color: "bg-purple-100 text-purple-700" },
};

const DUE_DATE_LABELS: Record<DueDateFilter, { label: string; color: string }> = {
  overdue: { label: "Overdue", color: "bg-destructive/15 text-destructive" },
  today: { label: "Due today", color: "bg-warning/15 text-warning" },
  this_week: { label: "This week", color: "bg-blue-100 text-blue-700" },
  no_due_date: { label: "No due date", color: "bg-muted text-muted-foreground" },
};

function FilterChip({
  label,
  color,
  onClick,
}: {
  label: string;
  color?: string;
  onClick?: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full shrink-0 h-auto hover:opacity-80 ${
        color ?? "bg-muted text-muted-foreground"
      }`}
    >
      {label}
    </Button>
  );
}

export const FilterBar = memo(function FilterBar({
  filters,
  onFiltersChange,
  agents,
  onOpenFilters,
}: FilterBarProps) {
  const [searchInput, setSearchInput] = useState(filters.searchQuery);

  // Sync external filter changes back to input (e.g. sidebar clear-all)
  useEffect(() => {
    if (filters.searchQuery !== searchInput) {
      setSearchInput(filters.searchQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.searchQuery]);

  // Apply search on Enter key
  const applySearch = useCallback(() => {
    onFiltersChange((prev) =>
      prev.searchQuery === searchInput ? prev : { ...prev, searchQuery: searchInput },
    );
  }, [searchInput, onFiltersChange]);

  const activeCount =
    filters.priorities.length +
    filters.assigneeIds.length +
    filters.tags.length +
    (filters.unassignedOnly ? 1 : 0) +
    (filters.noProjectOnly ? 1 : 0) +
    (filters.dueDateFilter ? 1 : 0) +
    (filters.blockedOnly ? 1 : 0) +
    (filters.topLevelOnly ? 1 : 0);

  // Build applied filter chips (read-only — click opens sidebar to edit)
  const chips: { key: string; label: string; color: string }[] = [];

  for (const p of filters.priorities) {
    const info = PRIORITY_LABELS[p];
    if (info) {
      chips.push({ key: `priority-${p}`, label: info.label, color: info.color });
    }
  }

  if (filters.dueDateFilter) {
    const info = DUE_DATE_LABELS[filters.dueDateFilter];
    chips.push({ key: "due-date", label: info.label, color: info.color });
  }

  if (filters.unassignedOnly) {
    chips.push({ key: "unassigned", label: "Unassigned", color: "bg-gray-800 text-white" });
  }

  for (const agentId of filters.assigneeIds) {
    const agent = agents.find((a: Agent) => a.id === agentId);
    if (agent) {
      chips.push({
        key: `agent-${agentId}`,
        label: agent.name,
        color: "bg-primary/10 text-primary",
      });
    }
  }

  for (const tag of filters.tags) {
    chips.push({ key: `tag-${tag}`, label: tag, color: "bg-foreground text-background" });
  }

  if (filters.noProjectOnly) {
    chips.push({ key: "no-project", label: "No project", color: "bg-gray-800 text-white" });
  }

  if (filters.blockedOnly) {
    chips.push({ key: "blocked", label: "Blocked", color: "bg-orange-100 text-orange-700" });
  }

  if (filters.topLevelOnly) {
    chips.push({
      key: "top-level",
      label: "Top-level only",
      color: "bg-muted text-muted-foreground",
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-0 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <ShadcnInput
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applySearch();
          }}
          onBlur={applySearch}
          placeholder="Search tasks… (Enter to apply)"
          className="pl-9 pr-3 py-1.5 w-full text-sm rounded-lg bg-background"
        />
        {searchInput && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              setSearchInput("");
              onFiltersChange((prev) => ({ ...prev, searchQuery: "" }));
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Filters button */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onOpenFilters}
        className={`relative flex items-center gap-1.5 shrink-0 ${
          activeCount > 0
            ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15"
            : "bg-background text-muted-foreground border-border hover:bg-muted"
        }`}
      >
        <SlidersHorizontal className="w-4 h-4" />
        <span>Filters</span>
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-primary text-primary-foreground">
            {activeCount}
          </span>
        )}
      </Button>

      {/* Applied filter chips — click opens sidebar to edit */}
      {chips.map((chip) => (
        <FilterChip key={chip.key} label={chip.label} color={chip.color} onClick={onOpenFilters} />
      ))}
    </div>
  );
});
