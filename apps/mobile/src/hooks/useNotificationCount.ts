import { useEffect, useRef } from "react";
import { useQuery, useSubscription } from "urql";
import { UNDELIVERED_NOTIFICATIONS_QUERY, ON_NOTIFICATION } from "@agentcenter/graphql-client";
import { useAuth } from "../context/AuthContext";

/**
 * Returns the live count of undelivered notifications for the current user.
 * Initial count comes from UNDELIVERED_NOTIFICATIONS_QUERY; the
 * ON_NOTIFICATION subscription triggers a refetch when new ones arrive.
 */
export function useNotificationCount(): number {
  const { profileId } = useAuth();

  const [result, reexecute] = useQuery<{ undeliveredNotifications: { id: string }[] }>({
    query: UNDELIVERED_NOTIFICATIONS_QUERY,
    requestPolicy: "cache-and-network",
    pause: !profileId,
  });

  // Track subscription results so we can trigger a refetch on new notifications
  const [subResult] = useSubscription<{ notification: { id: string } }, number>(
    {
      query: ON_NOTIFICATION,
      variables: { profileId: profileId ?? "" },
      pause: !profileId,
    }
  );

  // When a new notification arrives via subscription, refetch the count
  const prevSubData = useRef<unknown>(null);
  useEffect(() => {
    if (subResult.data && subResult.data !== prevSubData.current) {
      prevSubData.current = subResult.data;
      reexecute({ requestPolicy: "network-only" });
    }
  }, [subResult.data, reexecute]);

  return result.data?.undeliveredNotifications?.length ?? 0;
}
