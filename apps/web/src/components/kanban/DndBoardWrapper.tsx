"use client";

import { type ReactNode, useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { useMutation } from "urql";
import { setPendingMoveInsertAfter } from "../../lib/graphql/client";
import { UPDATE_TASK } from "../../lib/graphql/mutations";
import { TaskCard } from "./TaskCard";
import type { TaskCard as TaskCardType, Agent } from "@/lib/types";

interface DndBoardWrapperProps {
  children: ReactNode;
  agents: Agent[];
  onTaskClick: (task: TaskCardType) => void;
  /** Valid column status ids (e.g. inbox, in_progress). Used to resolve drop target. */
  statusIds: string[];
  /** Map task id -> status. When drop target is a task card, we use this to get the column status. */
  taskIdToStatus: Map<string, string>;
  /** Optimistic: called immediately on drop so the task stays in the new column. insertAfterTaskId = drop target task id to insert after, or null to append. */
  onTaskMoved?: (
    taskId: string,
    fromStatus: string,
    toStatus: string,
    task: TaskCardType,
    insertAfterTaskId: string | null,
  ) => void;
  /** Only called if the background update fails; use to move the task back to the source column. */
  onTaskMoveFailed?: (
    taskId: string,
    fromStatus: string,
    toStatus: string,
    task: TaskCardType,
  ) => void;
}

export default function DndBoardWrapper({
  children,
  agents,
  onTaskClick,
  statusIds,
  taskIdToStatus,
  onTaskMoved,
  onTaskMoveFailed,
}: DndBoardWrapperProps) {
  const [, executeUpdateTask] = useMutation(UPDATE_TASK);
  const [activeTask, setActiveTask] = useState<TaskCardType | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = event.active.data.current?.task;
    if (task) setActiveTask(task);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      const task = active.data.current?.task as
        | { id: string; status: string; [key: string]: unknown }
        | undefined;
      setActiveTask(null);
      if (!over || !task) return;
      // Resolve drop target: over.id can be a column (status) or a task card. If it's a task, use that task's column.
      const overId = String(over.id);
      const resolvedStatus: string | null = statusIds.includes(overId)
        ? overId
        : (taskIdToStatus.get(overId) ?? null);
      const fromStatus = task.status ?? "";
      if (!resolvedStatus || fromStatus === resolvedStatus) return;

      // When dropping on a task card, insert after that task; when dropping on empty column, append.
      const insertAfterTaskId = statusIds.includes(overId)
        ? null
        : taskIdToStatus.has(overId)
          ? overId
          : null;

      const optimisticTask = { ...task, status: resolvedStatus } as TaskCardType;
      onTaskMoved?.(task.id, fromStatus, resolvedStatus, optimisticTask, insertAfterTaskId);

      setPendingMoveInsertAfter(insertAfterTaskId);

      const result = await executeUpdateTask({
        id: active.id as string,
        status: resolvedStatus,
      });
      if (result.error) {
        setPendingMoveInsertAfter(null);
        toast.error("Failed to move task");
        onTaskMoveFailed?.(task.id, fromStatus, resolvedStatus, task as unknown as TaskCardType);
      }
    },
    [executeUpdateTask, onTaskMoved, onTaskMoveFailed, statusIds, taskIdToStatus],
  );

  return (
    <DndContext
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}

      <DragOverlay>
        {activeTask ? (
          <div className="rotate-2 shadow-xl opacity-90">
            <TaskCard task={activeTask} agents={agents} onClick={onTaskClick} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
