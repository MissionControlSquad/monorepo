"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

interface AgentDetailContextType {
  openAgentId: string | null;
  openAgent: (agentId: string) => void;
  closeAgent: () => void;
}

const AgentDetailContext = createContext<AgentDetailContextType | undefined>(undefined);

export function AgentDetailProvider({ children }: { children: React.ReactNode }) {
  const [openAgentId, setOpenAgentId] = useState<string | null>(null);
  const openAgent = useCallback((agentId: string) => setOpenAgentId(agentId), []);
  const closeAgent = useCallback(() => setOpenAgentId(null), []);
  const value = { openAgentId, openAgent, closeAgent };
  return <AgentDetailContext.Provider value={value}>{children}</AgentDetailContext.Provider>;
}

export function useAgentDetail() {
  const ctx = useContext(AgentDetailContext);
  if (!ctx) {
    throw new Error("useAgentDetail must be used within AgentDetailProvider");
  }
  return ctx;
}
