"use client";

import { createPanelContext } from "@agentcenter/hooks";

const { Provider: ProjectDetailProvider, usePanel } = createPanelContext("ProjectDetail");

export { ProjectDetailProvider };

export function useProjectDetail() {
  const { openId, open, close } = usePanel();
  return { openProjectId: openId, openProject: open, closeProject: close };
}
