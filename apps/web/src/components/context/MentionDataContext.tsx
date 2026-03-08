"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useQuery } from "urql";
import { PROFILES_QUERY, TASKS_QUERY } from "../../lib/graphql/queries";
import type { MentionSuggestionCategory } from "../../lib/mentions";
import { MENTION_SUGGESTION_CATEGORIES } from "../../lib/mentions";
import { useAppContext } from "./AppContext";
import { useAgentStatus } from "./AgentStatusContext";
import { buildMentionSources } from "../common/buildMentionSources";
import type { ProfileWithAgent, Agent, TaskListItem, Project } from "../../lib/types";

const TASKS_LIMIT = 50;

export interface MentionDataMaps {
  profileById: Map<
    string,
    { id: string; username?: string | null; displayName: string; [k: string]: unknown }
  >;
  agentById: Map<
    string,
    {
      id: string;
      name: string;
      profile?: { id: string; displayName?: string };
      [k: string]: unknown;
    }
  >;
  taskById: Map<string, { title: string; taskNumber?: string | number | null }>;
  projectById: Map<string, { name: string }>;
}

export interface MentionDataContextType {
  /** Raw lists for building suggestion sources and contentHandlesToIds. */
  profiles: ProfileWithAgent[];
  agents: Agent[];
  tasks: TaskListItem[];
  projects: Project[];
  /** Lookup maps for resolving mentions in preview and message content. */
  profileById: MentionDataMaps["profileById"];
  agentById: MentionDataMaps["agentById"];
  taskById: MentionDataMaps["taskById"];
  projectById: MentionDataMaps["projectById"];
  loading: boolean;
}

const MentionDataContext = createContext<MentionDataContextType | undefined>(undefined);

export function MentionDataProvider({ children }: { children: React.ReactNode }) {
  const { agents: contextAgents = [] } = useAgentStatus();
  const { projects: contextProjects = [] } = useAppContext();
  const [profilesResult] = useQuery({ query: PROFILES_QUERY });
  const [tasksResult] = useQuery({ query: TASKS_QUERY, variables: { limit: TASKS_LIMIT } });

  const profiles = profilesResult.data?.profiles ?? [];
  const tasks = tasksResult.data?.tasks ?? [];
  const agents = Array.isArray(contextAgents) ? contextAgents : [];
  const projects = Array.isArray(contextProjects) ? contextProjects : [];

  const profileById = useMemo(
    () => (profiles.length ? new Map(profiles.map((p: ProfileWithAgent) => [p.id, p])) : new Map()),
    [profiles],
  );
  const agentById = useMemo(
    () => (agents.length ? new Map(agents.map((a: Agent) => [a.id, a])) : new Map()),
    [agents],
  );
  const taskById = useMemo(
    () =>
      tasks.length
        ? new Map(
            tasks.map((t: TaskListItem) => [t.id, { title: t.title, taskNumber: t.taskNumber }]),
          )
        : new Map(),
    [tasks],
  );
  const projectById = useMemo(
    () =>
      projects.length ? new Map(projects.map((p: Project) => [p.id, { name: p.name }])) : new Map(),
    [projects],
  );

  const loading = profilesResult.fetching || tasksResult.fetching;

  const value: MentionDataContextType = useMemo(
    () => ({
      profiles,
      agents,
      tasks,
      projects,
      profileById,
      agentById,
      taskById,
      projectById,
      loading,
    }),
    [profiles, agents, tasks, projects, profileById, agentById, taskById, projectById, loading],
  );

  return <MentionDataContext.Provider value={value}>{children}</MentionDataContext.Provider>;
}

export function useMentionData(): MentionDataContextType {
  const context = useContext(MentionDataContext);
  if (!context) {
    throw new Error("useMentionData must be used within MentionDataProvider");
  }
  return context;
}

const DEFAULT_CATEGORIES = [...MENTION_SUGGESTION_CATEGORIES];

/** Build suggestion sources for MentionTextArea from central mention data. Use in any component that has a @mention text area. */
export function useMentionSuggestions(
  categories: MentionSuggestionCategory[] = DEFAULT_CATEGORIES,
) {
  const data = useMentionData();
  return useMemo(
    () =>
      buildMentionSources({
        categories,
        profiles: data.profiles,
        agents: data.agents,
        tasks: data.tasks,
        projects: data.projects,
      }),
    [categories, data.profiles, data.agents, data.tasks, data.projects],
  );
}
