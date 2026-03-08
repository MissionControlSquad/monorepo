"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";

interface TaskRef {
  id: string;
  taskNumber?: number;
}

interface TaskListContextValue {
  /** Ordered list of task references (from kanban board or other views) */
  taskRefs: TaskRef[];
  /** Set the ordered task list */
  setTaskRefs: (refs: TaskRef[]) => void;
  /** Get previous task relative to current task ID */
  getPrev: (currentTaskId: string) => TaskRef | null;
  /** Get next task relative to current task ID */
  getNext: (currentTaskId: string) => TaskRef | null;
}

const TaskListContext = createContext<TaskListContextValue | null>(null);

export function TaskListProvider({ children }: { children: React.ReactNode }) {
  const [taskRefs, setTaskRefs] = useState<TaskRef[]>([]);

  const getPrev = useCallback(
    (currentTaskId: string) => {
      const idx = taskRefs.findIndex((t) => t.id === currentTaskId);
      if (idx <= 0) return null;
      return taskRefs[idx - 1];
    },
    [taskRefs],
  );

  const getNext = useCallback(
    (currentTaskId: string) => {
      const idx = taskRefs.findIndex((t) => t.id === currentTaskId);
      if (idx === -1 || idx >= taskRefs.length - 1) return null;
      return taskRefs[idx + 1];
    },
    [taskRefs],
  );

  const value = useMemo(
    () => ({ taskRefs, setTaskRefs, getPrev, getNext }),
    [taskRefs, setTaskRefs, getPrev, getNext],
  );

  return <TaskListContext.Provider value={value}>{children}</TaskListContext.Provider>;
}

export function useTaskList() {
  return useContext(TaskListContext);
}
