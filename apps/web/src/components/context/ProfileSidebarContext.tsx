"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

interface ProfileSidebarContextType {
  openProfileId: string | null;
  openProfile: (profileId: string) => void;
  closeProfile: () => void;
}

const ProfileSidebarContext = createContext<ProfileSidebarContextType | undefined>(undefined);

export function ProfileSidebarProvider({ children }: { children: React.ReactNode }) {
  const [openProfileId, setOpenProfileId] = useState<string | null>(null);
  const openProfile = useCallback((profileId: string) => setOpenProfileId(profileId), []);
  const closeProfile = useCallback(() => setOpenProfileId(null), []);
  const value = { openProfileId, openProfile, closeProfile };
  return <ProfileSidebarContext.Provider value={value}>{children}</ProfileSidebarContext.Provider>;
}

export function useProfileSidebar() {
  const ctx = useContext(ProfileSidebarContext);
  if (!ctx) {
    throw new Error("useProfileSidebar must be used within ProfileSidebarProvider");
  }
  return ctx;
}
