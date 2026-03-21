"use client";

import { useState, useMemo } from "react";
import { useQuery } from "urql";
import { DELIVERABLES_BY_AGENT_QUERY } from "../../lib/graphql/queries";
import { useTaskNavigation } from "../../hooks/useTaskNavigation";
import { useDeliverableNavigation } from "../../hooks/useDeliverableNavigation";
import {
  FileText,
  Code,
  Link as LinkIcon,
  File,
  ArrowUpRight,
  ChevronDown,
  Package,
} from "lucide-react";
import { TimeAgo } from "../common/TimeAgo";
import { Card, Button, SkeletonList } from "../ui";
import type { Deliverable } from "@agentcenter/types";

interface RecentDeliverablesListProps {
  agentId: string;
  projectId?: string;
}

const PAGE_SIZE = 20;

const KIND_ICONS: Record<string, any> = {
  markdown: FileText,
  code: Code,
  link: LinkIcon,
  file: File,
};

const KIND_COLORS: Record<string, string> = {
  markdown: "text-blue-600 bg-blue-50",
  code: "text-purple-600 bg-purple-50",
  link: "text-green-600 bg-green-50",
  file: "text-gray-600 bg-gray-100",
};

const KIND_LABELS: Record<string, string> = {
  markdown: "Markdown",
  code: "Code",
  link: "Link",
  file: "File",
};

export function RecentDeliverablesList({ agentId, projectId }: RecentDeliverablesListProps) {
  const [result] = useQuery({
    query: DELIVERABLES_BY_AGENT_QUERY,
    variables: { agentId, projectId },
  });
  const deliverables = result.data?.deliverablesByAgent as Deliverable[] | undefined;
  const openTask = useTaskNavigation();
  const openDeliverable = useDeliverableNavigation();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const sorted = useMemo(
    () =>
      deliverables
        ? [...deliverables].sort((a: Deliverable, b: Deliverable) =>
            (b.createdAt ?? "") > (a.createdAt ?? "")
              ? 1
              : (b.createdAt ?? "") < (a.createdAt ?? "")
                ? -1
                : 0,
          )
        : null,
    [deliverables],
  );

  const visible = sorted?.slice(0, visibleCount);
  const hasMore = sorted ? sorted.length > visibleCount : false;

  return (
    <Card className="flex flex-col h-full">
      <div className="flex-shrink-0 px-3 py-2.5 @xl:px-5 @xl:py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Deliverables</h3>
        {sorted && <span className="text-xs text-gray-400 font-medium">{sorted.length} items</span>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-100">
        {!sorted ? (
          <div className="p-5">
            <SkeletonList count={3} height="h-16" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2">
              <Package className="w-5 h-5 text-gray-300" />
            </div>
            <p className="text-sm text-gray-400">No deliverables yet</p>
            <p className="text-xs text-gray-300 mt-0.5">Work output will show up here</p>
          </div>
        ) : (
          <>
            {visible!.map((d) => {
              const Icon = KIND_ICONS[d.kind] || File;
              const colorClass = KIND_COLORS[d.kind] || "text-gray-600 bg-gray-100";

              return (
                <div
                  key={d.id}
                  className="flex items-center gap-2.5 px-3 py-2.5 @xl:gap-3 @xl:px-4 @xl:py-3 hover:bg-gray-50 cursor-pointer transition group"
                  onClick={() => openDeliverable(d.id)}
                >
                  {/* Kind icon */}
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Title + task info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                      {d.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] text-gray-400">
                        {KIND_LABELS[d.kind] ?? d.kind}
                      </span>
                      {d.language && (
                        <span className="text-[11px] text-gray-400 font-mono">({d.language})</span>
                      )}
                      {d.task?.title && (
                        <>
                          <span className="text-[11px] text-gray-300">·</span>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTask(d.task?.taskNumber ?? d.task?.id ?? d.taskId);
                            }}
                            className="inline-flex items-center gap-0.5 text-[11px] text-indigo-500 hover:text-indigo-700 truncate max-w-[180px] h-auto px-0 py-0"
                            title={`View task: ${d.task.title}`}
                          >
                            {d.task.taskNumber != null && (
                              <span className="font-medium">#{d.task.taskNumber}</span>
                            )}
                            <span className="truncate">{d.task.title}</span>
                            <ArrowUpRight className="w-3 h-3 flex-shrink-0" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Time */}
                  <TimeAgo
                    date={d.createdAt!}
                    className="text-[11px] text-gray-400 flex-shrink-0 hidden @xl:block"
                  />
                </div>
              );
            })}
            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50/50"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                Show more ({sorted.length - visibleCount} remaining)
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
