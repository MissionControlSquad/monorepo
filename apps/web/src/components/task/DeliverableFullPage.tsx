"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "urql";
import { DELIVERABLE_WITH_CONTEXT_QUERY } from "../../lib/graphql/queries";
import { DeliverableFullView } from "./DeliverableFullView";
import { toast } from "sonner";

function DeliverablePageSkeleton() {
  return (
    <div className="relative z-[60]">
      {/* Backdrop — matches DeliverableFullView Dialog */}
      <div className="fixed inset-x-0 bottom-0 top-titlebar bg-black/50 backdrop-blur-sm" />
      <div className="fixed inset-x-0 bottom-0 top-titlebar lg:overflow-y-auto">
        <div className="h-full lg:h-auto lg:flex lg:min-h-full lg:items-center lg:justify-center lg:p-4">
          <div className="w-full h-full lg:h-auto lg:max-w-4xl overflow-hidden lg:rounded-2xl bg-background shadow-2xl">
            <div className="flex flex-col h-full lg:h-[85vh]">
              {/* Header — matches px-4 sm:px-6 py-3 sm:py-4 border-b border-border */}
              <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-b border-border animate-pulse">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    {/* Badge row */}
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-16 bg-muted rounded-full" />
                    </div>
                    {/* Title */}
                    <div className="h-6 bg-muted rounded w-2/3" />
                    {/* Agent + timestamp row */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="w-5 h-5 bg-muted rounded-full" />
                      <div className="h-3 bg-muted rounded w-20" />
                      <div className="h-3 bg-muted rounded w-16" />
                    </div>
                  </div>
                  {/* Close button */}
                  <div className="h-8 w-8 bg-muted rounded-lg shrink-0" />
                </div>
              </div>

              {/* Body — matches flex-1 overflow-y-auto + px-4 sm:px-6 py-4 sm:py-5 */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-4 sm:px-6 py-4 sm:py-5 animate-pulse space-y-3">
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-4 bg-muted rounded w-5/6" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                  <div className="h-4 bg-muted rounded w-4/5" />
                  <div className="h-32 bg-muted rounded-lg w-full mt-2" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DeliverableFullPageProps {
  deliverableId: string;
}

export function DeliverableFullPage({ deliverableId }: DeliverableFullPageProps) {
  const router = useRouter();

  const [result] = useQuery({
    query: DELIVERABLE_WITH_CONTEXT_QUERY,
    variables: { id: deliverableId },
  });

  const data = result.data?.deliverableWithContext;
  const isLoading = result.fetching;

  const goHome = useCallback(() => {
    router.push("/");
  }, [router]);

  useEffect(() => {
    if (!isLoading && data === null) {
      toast.error("Deliverable not found");
      goHome();
    }
  }, [data, isLoading, goHome]);

  if (isLoading || data === undefined || data === null) return <DeliverablePageSkeleton />;

  return (
    <DeliverableFullView
      deliverable={data}
      isOpen={true}
      onClose={goHome}
      agents={data.agent ? [data.agent] : []}
      taskInfo={
        data.task
          ? {
              taskId: data.task.id,
              taskNumber: data.task.taskNumber,
              taskTitle: data.task.title,
            }
          : undefined
      }
    />
  );
}
