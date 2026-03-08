"use client";

import { useState } from "react";
import { useQuery } from "urql";
import { DELIVERABLES_BY_CHILD_TASKS_QUERY } from "../../lib/graphql/queries";
import { useDeliverableNavigation } from "../../hooks/useDeliverableNavigation";
import { GitBranch, ChevronDown, ChevronRight } from "lucide-react";
import { DeliverableCard } from "./DeliverableCard";
import type { Deliverable, Agent, TaskRef } from "@/lib/types";

interface ChildTaskDeliverableGroup {
  task: TaskRef & { taskNumber?: number; status?: string };
  deliverables: (Deliverable & { agentId?: string })[];
  agents?: Record<string, Agent> | null;
}

interface ChildTaskDeliverablesProps {
  parentTaskId: string;
}

export function ChildTaskDeliverables({ parentTaskId }: ChildTaskDeliverablesProps) {
  const [result] = useQuery({
    query: DELIVERABLES_BY_CHILD_TASKS_QUERY,
    variables: { parentTaskId },
  });
  const groups = result.data?.deliverablesByChildTasks;
  const openDeliverable = useDeliverableNavigation();
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());

  if (!groups) {
    return (
      <div className="flex items-center justify-center py-4 text-muted-foreground">
        <div className="animate-pulse flex items-center gap-2 text-sm">
          <div className="w-4 h-4 rounded-full bg-muted" />
          Loading subtask deliverables...
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-3">
          <GitBranch className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">No subtask deliverables</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Deliverables from subtasks will appear here
        </p>
      </div>
    );
  }

  const totalDeliverables = groups.reduce(
    (sum: number, g: ChildTaskDeliverableGroup) => sum + (g?.deliverables?.length ?? 0),
    0,
  );

  const toggleCollapse = (taskId: string) => {
    setCollapsedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Subtask Deliverables
        </h3>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {totalDeliverables}
        </span>
      </div>

      <div className="space-y-3">
        {groups.map((group: ChildTaskDeliverableGroup) => {
          if (!group) return null;
          const { task, deliverables, agents } = group;
          const isCollapsed = collapsedTasks.has(task.id);

          return (
            <div key={task.id} className="rounded-lg border border-border overflow-hidden">
              {/* Child task header */}
              <button
                onClick={() => toggleCollapse(task.id)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted transition-colors text-left"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    task.status === "done"
                      ? "bg-success"
                      : task.status === "in_progress"
                        ? "bg-blue-400"
                        : task.status === "blocked"
                          ? "bg-destructive"
                          : "bg-gray-300"
                  }`}
                />
                {task.taskNumber && (
                  <span className="text-xs text-muted-foreground shrink-0">#{task.taskNumber}</span>
                )}
                <span className="text-sm font-medium text-foreground truncate flex-1">
                  {task.title}
                </span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground shrink-0">
                  {deliverables.length}
                </span>
              </button>

              {/* Deliverable cards */}
              {!isCollapsed && (
                <div className="p-2 space-y-2">
                  {deliverables.map((d: Deliverable & { agentId?: string }) => {
                    const agent = (d.agentId ? agents?.[d.agentId] : undefined) ?? null;
                    return (
                      <DeliverableCard
                        key={d.id}
                        deliverable={d}
                        agent={agent}
                        onClick={() => openDeliverable(d.id)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
