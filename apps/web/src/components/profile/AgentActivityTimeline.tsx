"use client";

import { useState, useEffect } from "react";
import { useQuery, useSubscription } from "urql";
import { ACTIVITIES_BY_AGENT_QUERY } from "../../lib/graphql/queries";
import { ACTIVITY_CREATED_SUBSCRIPTION } from "../../lib/graphql/subscriptions";
import { Coffee } from "lucide-react";
import { ActivityItem } from "../layout/ActivityFeed";
import { Card, SkeletonList } from "../ui";
import type { Activity } from "@agentcenter/types";

interface AgentActivityTimelineProps {
  agentId: string;
  projectId?: string;
}

export function AgentActivityTimeline({ agentId, projectId }: AgentActivityTimelineProps) {
  const [result] = useQuery({
    query: ACTIVITIES_BY_AGENT_QUERY,
    variables: { agentId, limit: 50 },
    requestPolicy: "cache-and-network",
  });

  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    const data = result.data?.activitiesByAgent;
    if (data) setActivities(data);
  }, [result.data?.activitiesByAgent]);

  // Subscribe to new activities and prepend matching ones
  const [subResult] = useSubscription({
    query: ACTIVITY_CREATED_SUBSCRIPTION,
    variables: { projectId: projectId ?? undefined },
  });

  useEffect(() => {
    const newActivity = subResult.data?.activityCreated;
    if (!newActivity) return;
    // Only include activities from this agent's profile
    if (!newActivity.profile?.agentId || newActivity.profile.agentId !== agentId) return;
    setActivities((prev) => {
      if (prev.some((a: Activity) => a.id === newActivity.id)) return prev;
      return [newActivity, ...prev];
    });
  }, [subResult.data?.activityCreated, agentId]);

  const isLoading = result.fetching && activities.length === 0;

  return (
    <Card className="flex flex-col h-full">
      <div className="flex-shrink-0 px-3 py-2.5 @xl:px-5 @xl:py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Activity</h3>
        {activities.length > 0 && (
          <span className="text-xs text-muted-foreground font-medium">{activities.length} events</span>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="p-4">
            <SkeletonList count={5} height="h-10" />
          </div>
        ) : activities.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2">
              <Coffee className="w-5 h-5 text-gray-300" />
            </div>
            <p className="text-sm text-muted-foreground">No activity yet</p>
            <p className="text-xs text-gray-300 mt-0.5">
              Activity will appear as the agent works on tasks
            </p>
          </div>
        ) : (
          <div>
            {activities.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
