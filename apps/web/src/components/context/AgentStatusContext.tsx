"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useQuery, useSubscription } from "urql";
import { AGENTS_QUERY, AGENT_LATEST_TRANSITIONS_QUERY } from "../../lib/graphql/queries";
import { AGENT_STATUS_CHANGED_SUBSCRIPTION } from "../../lib/graphql/subscriptions";
import { HEARTBEAT_TIMEOUT_MS } from "../../lib/constants";
import { formatTimeAgo } from "../common/TimeAgo";
import type { Agent, StatusHistoryEntry } from "@agentcenter/types";

export interface OnlineInfo {
  isOnline: boolean;
  lastSeenFormatted: string;
  timeSinceLastHeartbeat: number;
}

interface AgentStatusContextType {
  agents: Agent[] | undefined;
  transitions: StatusHistoryEntry[] | undefined;
  getOnlineInfo: (agentId: string) => OnlineInfo;
  refetchAgents: () => void;
}

const FALLBACK_INFO: OnlineInfo = {
  isOnline: false,
  lastSeenFormatted: "Never",
  timeSinceLastHeartbeat: Infinity,
};

const AgentStatusContext = createContext<AgentStatusContextType | undefined>(undefined);

export function AgentStatusProvider({ children }: { children: React.ReactNode }) {
  const [agentsResult, reexecuteAgents] = useQuery({ query: AGENTS_QUERY });
  const agents = agentsResult.data?.agents as Agent[] | undefined;
  const [transitionsResult, reexecuteTransitions] = useQuery({
    query: AGENT_LATEST_TRANSITIONS_QUERY,
  });
  const transitions = transitionsResult.data?.agentLatestTransitions;
  const [now, setNow] = useState(Date.now());

  // Track known agent IDs so we can detect genuinely new agents
  const knownAgentIds = useRef(new Set<string>());
  useEffect(() => {
    if (agents) {
      knownAgentIds.current = new Set(agents.map((a: Agent) => a.id));
    }
  }, [agents]);

  // Track previous status per agent to detect real status transitions
  const prevStatusMap = useRef(new Map<string, string>());

  // Graphcache auto-merges field updates for existing agents.
  // We only refetch the full list when a brand-new agent appears.
  // Transitions only change on real status changes (idle/active/blocked), not detailedStatus.
  useSubscription({ query: AGENT_STATUS_CHANGED_SUBSCRIPTION }, (_prev, data) => {
    const updated = data?.agentStatusChanged;
    if (!updated) return data;

    if (!knownAgentIds.current.has(updated.id)) {
      reexecuteAgents({ requestPolicy: "network-only" });
    }

    // Only refetch transitions when the top-level status actually changed
    const prevStatus = prevStatusMap.current.get(updated.id);
    if (prevStatus !== updated.status) {
      prevStatusMap.current.set(updated.id, updated.status);
      reexecuteTransitions({ requestPolicy: "network-only" });
    }

    return data;
  });

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(interval);
  }, []);

  const onlineMap = useMemo(() => {
    const map = new Map<string, OnlineInfo>();
    if (!agents) return map;

    for (const agent of agents) {
      if (!agent.lastHeartbeat) {
        map.set(agent.id, FALLBACK_INFO);
      } else {
        const heartbeatTime =
          typeof agent.lastHeartbeat === "string"
            ? new Date(agent.lastHeartbeat).getTime()
            : agent.lastHeartbeat;
        const elapsed = now - heartbeatTime;
        map.set(agent.id, {
          isOnline: elapsed < HEARTBEAT_TIMEOUT_MS,
          lastSeenFormatted: formatTimeAgo(heartbeatTime),
          timeSinceLastHeartbeat: elapsed,
        });
      }
    }
    return map;
  }, [agents, now]);

  const getOnlineInfo = useMemo(() => {
    return (agentId: string): OnlineInfo => {
      return onlineMap.get(agentId) || FALLBACK_INFO;
    };
  }, [onlineMap]);

  const refetchAgents = useCallback(() => {
    reexecuteAgents({ requestPolicy: "network-only" });
  }, [reexecuteAgents]);

  const value = useMemo(
    () => ({ agents, transitions, getOnlineInfo, refetchAgents }),
    [agents, transitions, getOnlineInfo, refetchAgents],
  );

  return <AgentStatusContext.Provider value={value}>{children}</AgentStatusContext.Provider>;
}

export function useAgentStatus() {
  const context = useContext(AgentStatusContext);
  if (!context) {
    throw new Error("useAgentStatus must be used within AgentStatusProvider");
  }
  return context;
}
