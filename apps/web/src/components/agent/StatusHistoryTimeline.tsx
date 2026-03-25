"use client";

import { useQuery } from "urql";
import { AGENT_STATUS_HISTORY_QUERY } from "../../lib/graphql/queries";
import { Clock } from "lucide-react";
import { TimeAgo } from "../common/TimeAgo";
import { STATUS_DOT_CLASSES } from "../../lib/constants";
import { getAgentStatusLabel } from "@agentcenter/utils";
import type { StatusHistoryEntry } from "@agentcenter/types";

interface StatusHistoryTimelineProps {
  agentId: string;
  limit?: number;
}

export function StatusHistoryTimeline({ agentId, limit = 20 }: StatusHistoryTimelineProps) {
  const [result] = useQuery({ query: AGENT_STATUS_HISTORY_QUERY, variables: { agentId, limit } });
  const history = result.data?.agentStatusHistory as StatusHistoryEntry[] | undefined;

  if (!history || history.length === 0) {
    return (
      <div className="text-center py-4">
        <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">No status history yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {history.map((entry, idx) => {
        const toDotKey = entry.toDetailedStatus || entry.toStatus;
        const dotClass = STATUS_DOT_CLASSES[toDotKey] || STATUS_DOT_CLASSES.idle;
        const toLabel = getAgentStatusLabel({
          status: entry.toStatus,
          detailedStatus: entry.toDetailedStatus,
        });
        const fromLabel = getAgentStatusLabel({
          status: entry.fromStatus,
          detailedStatus: entry.fromDetailedStatus,
        });
        const isLast = idx === history.length - 1;

        return (
          <div key={entry.id} className="flex items-start gap-3 relative">
            {/* Timeline line */}
            {!isLast && <div className="absolute left-[7px] top-5 bottom-0 w-px bg-border" />}

            {/* Dot */}
            <div className="relative z-10 mt-1.5 flex-shrink-0">
              <span className={`block w-3.5 h-3.5 rounded-full ring-2 ring-white ${dotClass}`} />
            </div>

            {/* Content */}
            <div className="pb-4 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{toLabel}</span>
                <span className="text-xs text-muted-foreground">from {fromLabel}</span>
              </div>
              {entry.statusMessage && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {entry.statusMessage}
                </p>
              )}
              <TimeAgo
                date={entry.timestamp}
                className="text-xs text-muted-foreground mt-0.5 block"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
