"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

interface ProjectDetailContextType {
  openProjectId: string | null;
  openProject: (projectId: string) => void;
  closeProject: () => void;
}

const ProjectDetailContext = createContext<ProjectDetailContextType | undefined>(undefined);

export function ProjectDetailProvider({ children }: { children: React.ReactNode }) {
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const openProject = useCallback((projectId: string) => setOpenProjectId(projectId), []);
  const closeProject = useCallback(() => setOpenProjectId(null), []);
  const value = { openProjectId, openProject, closeProject };
  return <ProjectDetailContext.Provider value={value}>{children}</ProjectDetailContext.Provider>;
}

export function useProjectDetail() {
  const ctx = useContext(ProjectDetailContext);
  if (!ctx) {
    throw new Error("useProjectDetail must be used within ProjectDetailProvider");
  }
  return ctx;
}
