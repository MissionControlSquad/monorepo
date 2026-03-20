"use client";

import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useQuery } from "urql";
import { PROJECTS_QUERY, ME_QUERY } from "../../lib/graphql/queries";
import { useAgentStatus } from "./AgentStatusContext";
import { FeatureFlagProvider } from "./FeatureFlagContext";
import type { Agent, Project } from "@agentcenter/types";

/** Logged-in user's profile (from session). Used for channels and comments when present. */
export interface CurrentUserProfile {
  id: string;
  kind: string;
  displayName: string;
  username?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  user?: { id: string; email: string } | null;
}

interface AppContextType {
  // Logged-in user's profile (from admin login); use for channels/comments when set
  currentUserProfile: CurrentUserProfile | null;

  // Selected project
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  currentProject: { id: string; name: string } | null;

  // Raw lists (for dropdowns and resolution)
  agents: Agent[] | undefined;
  projects: Project[] | undefined;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_PROJECT = "currentProjectId";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [projectId, setProjectIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Agents come from AgentStatusContext (single source of truth)
  const { agents } = useAgentStatus();
  const [projectsResult] = useQuery({ query: PROJECTS_QUERY });
  const [meResult] = useQuery({ query: ME_QUERY });
  const projects = projectsResult.data?.projects;
  const currentUserProfile = meResult.data?.me ?? null;

  useEffect(() => {
    const storedProject = localStorage.getItem(STORAGE_PROJECT);
    if (storedProject) setProjectIdState(storedProject);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (projectId) localStorage.setItem(STORAGE_PROJECT, projectId);
    else localStorage.removeItem(STORAGE_PROJECT);
  }, [projectId, hydrated]);

  const currentProject = useMemo(() => {
    if (!projects?.length || !projectId) return null;
    const p = projects.find((x: Project) => x.id === projectId);
    return p ? { id: p.id, name: p.name } : null;
  }, [projects, projectId]);

  const value: AppContextType = useMemo(
    () => ({
      currentUserProfile,
      projectId,
      setProjectId: setProjectIdState,
      currentProject,
      agents,
      projects,
    }),
    [currentUserProfile, projectId, currentProject, agents, projects],
  );

  return (
    <AppContext.Provider value={value}>
      <FeatureFlagProvider>{children}</FeatureFlagProvider>
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within AppProvider");
  }
  return context;
}

/** @deprecated Use useAppContext() instead; kept for migration. */
export function useCurrentProject() {
  const ctx = useAppContext();
  return {
    projectId: ctx.projectId,
    setProjectId: ctx.setProjectId,
    currentProject: ctx.currentProject,
  };
}
