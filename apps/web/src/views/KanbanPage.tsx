"use client";

import { useCallback } from "react";
import { KanbanBoard } from "../components/kanban/KanbanBoard";
import { ErrorBoundary, PanelErrorFallback } from "../components/common/ErrorBoundary";
import { useTaskNavigation } from "../hooks/useTaskNavigation";

export function KanbanPage() {
  const openTask = useTaskNavigation();

  const handleTaskClick = useCallback(
    (task: { taskNumber?: number; id: string }) => {
      openTask(task.taskNumber ?? task.id);
    },
    [openTask],
  );

  return (
    <div className="@container flex flex-col flex-1 overflow-hidden">
      {/* Kanban board */}
      <div className="flex-1 overflow-hidden">
        <ErrorBoundary
          fallback={({ resetErrorBoundary, error }) => (
            <PanelErrorFallback label="Task board" error={error} onRetry={resetErrorBoundary} />
          )}
        >
          <KanbanBoard onTaskClick={handleTaskClick} />
        </ErrorBoundary>
      </div>
    </div>
  );
}
