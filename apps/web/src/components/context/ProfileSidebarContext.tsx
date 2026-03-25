"use client";

import { createPanelContext } from "@agentcenter/hooks";

const { Provider: ProfileSidebarProvider, usePanel } = createPanelContext("ProfileSidebar");

export { ProfileSidebarProvider };

export function useProfileSidebar() {
  const { openId, open, close } = usePanel();
  return { openProfileId: openId, openProfile: open, closeProfile: close };
}
