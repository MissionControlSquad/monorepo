"use client";

import { createPanelContext } from "@agentcenter/hooks";

const { Provider: AgentDetailProvider, usePanel } = createPanelContext("AgentDetail");

export { AgentDetailProvider };

export function useAgentDetail() {
  const { openId, open, close } = usePanel();
  return { openAgentId: openId, openAgent: open, closeAgent: close };
}
