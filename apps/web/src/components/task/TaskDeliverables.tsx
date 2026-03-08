"use client";

import { useQuery } from "urql";
import { DELIVERABLES_BY_TASK_QUERY } from "../../lib/graphql/queries";
import { useDeliverableNavigation } from "../../hooks/useDeliverableNavigation";
import { Package } from "lucide-react";
import { DeliverableCard } from "./DeliverableCard";
import type { Agent, Deliverable } from "@/lib/types";

interface TaskDeliverablesProps {
  taskId: string;
  agents: Agent[];
}

export function TaskDeliverables({ taskId, agents }: TaskDeliverablesProps) {
  const [result] = useQuery({ query: DELIVERABLES_BY_TASK_QUERY, variables: { taskId } });
  const deliverables = result.data?.deliverablesByTask;
  const openDeliverable = useDeliverableNavigation();

  if (!deliverables) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <div className="animate-pulse flex items-center gap-2 text-sm">
          <div className="w-4 h-4 rounded-full bg-muted" />
          Loading deliverables...
        </div>
      </div>
    );
  }

  return (
    <div>
      {deliverables.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-3">
            <Package className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground font-medium">No deliverables yet</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Deliverables will appear here when agents submit work
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {deliverables.map((d: Deliverable) => (
            <DeliverableCard
              key={d.id}
              deliverable={d}
              agent={agents.find((a: Agent) => a.id === (d as any).agentId) ?? null}
              onClick={() => openDeliverable(d.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
