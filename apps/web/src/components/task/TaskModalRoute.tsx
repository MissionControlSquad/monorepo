"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "urql";
import { TASK_QUERY, TASK_BY_NUMBER_QUERY } from "../../lib/graphql/queries";
import { TaskDetailModal } from "./TaskDetailModal";
import { useTaskNavigation } from "../../hooks/useTaskNavigation";
import { toast } from "sonner";

function TaskOverlaySkeleton() {
  return (
    <div className="relative z-50">
      {/* Backdrop — matches TaskDetailModal */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="fixed inset-0">
        <div className="h-full">
          <div className="w-full h-full bg-background shadow-2xl flex flex-col">
            {/* Top bar — matches px-3 py-2 sm:px-6 sm:py-3 */}
            <div className="shrink-0 px-3 py-2 sm:px-6 sm:py-3 border-b border-border animate-pulse">
              <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                <div className="flex-1 min-w-0 min-w-[150px]">
                  <div className="h-6 bg-muted rounded w-2/5" />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="h-6 w-20 bg-muted rounded-full" />
                  <div className="h-6 w-16 bg-muted rounded-full" />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <div className="h-7 w-16 bg-muted rounded-lg" />
                  <div className="h-7 w-7 bg-muted rounded-lg" />
                </div>
              </div>
            </div>

            {/* 3-column body — matches md:flex-row */}
            <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden animate-pulse">
              {/* Col 1: Description (50%) */}
              <div className="hidden md:flex w-full md:w-1/2 min-w-0 flex-col md:border-r border-border">
                <div className="flex-1 px-3 py-3 sm:px-6 sm:py-4 space-y-4">
                  <div className="h-3 bg-muted rounded w-24" />
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded w-full" />
                    <div className="h-4 bg-muted rounded w-5/6" />
                    <div className="h-4 bg-muted rounded w-2/3" />
                    <div className="h-4 bg-muted rounded w-4/5" />
                  </div>
                </div>
              </div>

              {/* Col 2: Details (20%) */}
              <div className="hidden md:flex w-full md:w-1/5 min-w-0 md:border-r border-border bg-muted/50 flex-col">
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <div className="h-3 bg-muted rounded w-12" />
                    <div className="h-8 bg-muted rounded w-full" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-muted rounded w-16" />
                    <div className="h-8 bg-muted rounded w-full" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-muted rounded w-20" />
                    <div className="h-8 bg-muted rounded w-full" />
                  </div>
                </div>
              </div>

              {/* Col 3: Activity (30%) */}
              <div className="hidden md:flex w-full md:w-[30%] min-w-0 flex-col">
                <div className="p-4 space-y-3">
                  <div className="h-3 bg-muted rounded w-20" />
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-2">
                      <div className="w-7 h-7 bg-muted rounded-full shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-muted rounded w-24" />
                        <div className="h-3 bg-muted rounded w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TaskModalRouteProps {
  taskParam: string;
}

export function TaskModalRoute({ taskParam }: TaskModalRouteProps) {
  const router = useRouter();
  const openTask = useTaskNavigation();

  const isNumeric = !isNaN(Number(taskParam));

  const [byNumberResult] = useQuery({
    query: TASK_BY_NUMBER_QUERY,
    variables: { taskNumber: Number(taskParam) },
    pause: !isNumeric,
  });

  const [byIdResult] = useQuery({
    query: TASK_QUERY,
    variables: { id: taskParam },
    pause: isNumeric || !taskParam,
  });

  const result = isNumeric ? byNumberResult : byIdResult;
  const task = isNumeric ? result.data?.taskByNumber : result.data?.task;
  const isLoading = result.fetching;

  const goBack = useCallback(() => {
    router.back();
  }, [router]);

  useEffect(() => {
    if (!isLoading && task === null) {
      toast.error("Task not found");
      goBack();
    }
  }, [task, isLoading, goBack]);

  if (isLoading || task === undefined || task === null) return <TaskOverlaySkeleton />;

  return (
    <TaskDetailModal
      key={task.id ?? task._id}
      task={task}
      isOpen={true}
      onClose={goBack}
      onOpenTask={openTask}
    />
  );
}
