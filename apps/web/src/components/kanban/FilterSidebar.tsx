"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useQuery } from "urql";
import { X, Trash2, Search } from "lucide-react";
import { PROJECT_QUERY } from "../../lib/graphql/queries";
import { Button } from "../ui";
import { Input as ShadcnInput } from "@/components/ui/shadcn/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import type { FilterState, DueDateFilter } from "./FilterBar";
import type { Agent, ProjectMember } from "@agentcenter/types";

const PRIORITIES = [
  { id: "low", label: "Low", color: "bg-muted text-foreground border-border" },
  { id: "medium", label: "Medium", color: "bg-warning/15 text-warning border-warning/30" },
  { id: "high", label: "High", color: "bg-destructive/15 text-destructive border-destructive/30" },
  { id: "urgent", label: "Urgent", color: "bg-purple-100 text-purple-700 border-purple-200" },
];

const DUE_DATE_OPTIONS: { id: DueDateFilter; label: string; color: string }[] = [
  {
    id: "overdue",
    label: "Overdue",
    color: "bg-destructive/15 text-destructive border-destructive/30",
  },
  { id: "today", label: "Due today", color: "bg-warning/15 text-warning border-warning/30" },
  { id: "this_week", label: "This week", color: "bg-blue-100 text-blue-700 border-blue-200" },
  {
    id: "no_due_date",
    label: "No due date",
    color: "bg-muted text-muted-foreground border-border",
  },
];

type FilterUpdater = FilterState | ((prev: FilterState) => FilterState);

interface FilterSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onFiltersChange: (update: FilterUpdater) => void;
  agents: Agent[];
  allTags: string[];
  projectId: string | null;
}

const AGENT_DISPLAY_LIMIT = 20;

function AssigneeSection({
  agents,
  selectedIds,
  unassignedOnly,
  onToggleAssignee,
  onToggleUnassigned,
}: {
  agents: Agent[];
  selectedIds: string[];
  unassignedOnly: boolean;
  onToggleAssignee: (id: string) => void;
  onToggleUnassigned: () => void;
}) {
  const [search, setSearch] = useState("");
  const showSearch = agents.length > 0;

  // Selected agents always shown at top, then filtered remaining
  const { selected, filtered, hiddenCount } = useMemo(() => {
    const sel = agents.filter((a) => selectedIds.includes(a.id));
    const selIds = new Set(selectedIds);
    let rest = agents.filter((a) => !selIds.has(a.id));

    if (search) {
      const q = search.toLowerCase();
      rest = rest.filter((a) => a.name?.toLowerCase().includes(q));
    }

    const limited = rest.slice(0, AGENT_DISPLAY_LIMIT);
    return {
      selected: sel,
      filtered: limited,
      hiddenCount: rest.length - limited.length,
    };
  }, [agents, selectedIds, search]);

  return (
    <section>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Assignee
      </h3>

      {/* Search (only when many agents) */}
      {showSearch && (
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <ShadcnInput
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-background"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
      )}

      <div className="space-y-0.5 max-h-64 overflow-y-auto">
        {/* Unassigned toggle */}
        {!search && (
          <AgentRow
            label="Unassigned"
            avatar="?"
            isActive={unassignedOnly}
            onClick={onToggleUnassigned}
            avatarClass={
              unassignedOnly ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
            }
          />
        )}

        {/* Selected agents (always visible) */}
        {selected.map((agent) => (
          <AgentRow
            key={agent.id}
            label={agent.name}
            avatar={agent.avatar || agent.name?.[0]}
            isActive
            onClick={() => onToggleAssignee(agent.id)}
          />
        ))}

        {/* Remaining agents */}
        {filtered.map((agent) => (
          <AgentRow
            key={agent.id}
            label={agent.name}
            avatar={agent.avatar || agent.name?.[0]}
            isActive={false}
            onClick={() => onToggleAssignee(agent.id)}
          />
        ))}

        {hiddenCount > 0 && (
          <p className="text-[11px] text-muted-foreground px-2.5 py-1.5">
            +{hiddenCount} more — type to search
          </p>
        )}
      </div>
    </section>
  );
}

function AgentRow({
  label,
  avatar,
  isActive,
  onClick,
  avatarClass,
}: {
  label: string;
  avatar: string;
  isActive: boolean;
  onClick: () => void;
  avatarClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
        isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          avatarClass ?? (isActive ? "bg-primary text-white" : "bg-muted-foreground/40 text-white")
        }`}
      >
        {avatar}
      </div>
      <span className="truncate">{label}</span>
      {isActive && <div className="ml-auto w-2 h-2 rounded-full bg-primary shrink-0" />}
    </button>
  );
}

export function FilterSidebar({
  isOpen,
  onClose,
  filters,
  onFiltersChange,
  agents,
  allTags,
  projectId,
}: FilterSidebarProps) {
  // Draft state — initialized from applied filters each time the sidebar opens.
  // Changes are only pushed to parent on "Apply".
  const [draft, setDraft] = useState<FilterState>(filters);

  // Re-sync draft from applied filters whenever sidebar opens
  useEffect(() => {
    if (isOpen) setDraft(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Filter agents by project membership when a project is selected
  const [projectResult] = useQuery({
    query: PROJECT_QUERY,
    variables: { id: projectId! },
    pause: !projectId,
  });
  const project = projectResult.data?.project;
  const visibleAgents =
    projectId && project?.members
      ? agents.filter((a) =>
          project.members.some(
            (m: ProjectMember) => m.profile?.agentId === a.id || m.profile?.agent?.id === a.id,
          ),
        )
      : agents;

  const togglePriority = useCallback((priority: string) => {
    setDraft((prev) => ({
      ...prev,
      priorities: prev.priorities.includes(priority)
        ? prev.priorities.filter((p) => p !== priority)
        : [...prev.priorities, priority],
    }));
  }, []);

  const toggleDueDate = useCallback((id: DueDateFilter) => {
    setDraft((prev) => ({
      ...prev,
      dueDateFilter: prev.dueDateFilter === id ? null : id,
    }));
  }, []);

  const toggleAssignee = useCallback((agentId: string) => {
    setDraft((prev) => ({
      ...prev,
      assigneeIds: prev.assigneeIds.includes(agentId)
        ? prev.assigneeIds.filter((id) => id !== agentId)
        : [...prev.assigneeIds, agentId],
      unassignedOnly: false,
    }));
  }, []);

  const toggleUnassigned = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      unassignedOnly: !prev.unassignedOnly,
      assigneeIds: !prev.unassignedOnly ? [] : prev.assigneeIds,
    }));
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setDraft((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
    }));
  }, []);

  const toggleNoProject = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      noProjectOnly: !prev.noProjectOnly,
    }));
  }, []);

  const toggleBlocked = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      blockedOnly: !prev.blockedOnly,
    }));
  }, []);

  const toggleTopLevel = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      topLevelOnly: !prev.topLevelOnly,
    }));
  }, []);

  const clearAll = useCallback(() => {
    setDraft((prev) => ({
      searchQuery: prev.searchQuery, // preserve search
      priorities: [],
      assigneeIds: [],
      tags: [],
      unassignedOnly: false,
      noProjectOnly: false,
      dueDateFilter: null,
      blockedOnly: false,
      topLevelOnly: false,
    }));
  }, []);

  const handleApply = useCallback(() => {
    onFiltersChange(draft);
    onClose();
  }, [draft, onFiltersChange, onClose]);

  const activeCount =
    draft.priorities.length +
    draft.assigneeIds.length +
    draft.tags.length +
    (draft.unassignedOnly ? 1 : 0) +
    (draft.noProjectOnly ? 1 : 0) +
    (draft.blockedOnly ? 1 : 0) +
    (draft.topLevelOnly ? 1 : 0) +
    (draft.dueDateFilter ? 1 : 0);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" showCloseButton className="w-full sm:max-w-80 p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <SheetTitle className="text-sm">Filters</SheetTitle>
        </SheetHeader>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
          {/* Priority */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Priority
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITIES.map((p) => {
                const isActive = draft.priorities.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePriority(p.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      isActive
                        ? `${p.color} ring-2 ring-offset-1 ring-gray-200`
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Due date */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Due date
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {DUE_DATE_OPTIONS.map((d) => {
                const isActive = draft.dueDateFilter === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDueDate(d.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      isActive
                        ? `${d.color} ring-2 ring-offset-1 ring-gray-200`
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Assignees */}
          {visibleAgents.length > 0 && (
            <AssigneeSection
              agents={visibleAgents}
              selectedIds={draft.assigneeIds}
              unassignedOnly={draft.unassignedOnly}
              onToggleAssignee={toggleAssignee}
              onToggleUnassigned={toggleUnassigned}
            />
          )}

          {/* Tags */}
          {allTags.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((tag) => {
                  const isActive = draft.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`px-2.5 py-1.5 text-xs rounded-lg border transition-all ${
                        isActive
                          ? "bg-gray-800 text-white border-gray-800"
                          : "bg-background text-muted-foreground border-border hover:bg-muted"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* No project */}
          {!projectId && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Project
              </h3>
              <button
                type="button"
                onClick={toggleNoProject}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  draft.noProjectOnly
                    ? "bg-gray-800 text-white border-gray-800"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                No project assigned
              </button>
            </section>
          )}

          {/* Status */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Status
            </h3>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={toggleBlocked}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  draft.blockedOnly
                    ? "bg-orange-100 text-orange-700 border-orange-200 ring-2 ring-offset-1 ring-gray-200"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                Blocked
              </button>
              <button
                type="button"
                onClick={toggleTopLevel}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  draft.topLevelOnly
                    ? "bg-gray-800 text-white border-gray-800 ring-2 ring-offset-1 ring-gray-200"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                Top-level only
              </button>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            disabled={activeCount === 0}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed h-auto px-2 py-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear all
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="button" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
