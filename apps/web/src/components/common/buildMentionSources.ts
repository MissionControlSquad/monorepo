"use client";

import React from "react";
import { formatMention } from "../../lib/mentions";
import type { MentionSuggestionCategory } from "../../lib/mentions";
import type { MentionSuggestionSource } from "./MentionTextArea";
import {
  renderProfileSuggestion,
  renderAgentSuggestion,
  renderTaskSuggestion,
  renderProjectSuggestion,
} from "./MentionSuggestionList";
import type { ProfileWithAgent, Agent, TaskListItem, Project } from "@/lib/types";

export interface BuildMentionSourcesOptions {
  categories: MentionSuggestionCategory[];
  profiles: ProfileWithAgent[];
  agents: Agent[];
  tasks: TaskListItem[];
  projects: Project[];
  formatMention?: (type: "id" | "agent" | "task" | "project", id: string) => string;
  renderProfileSuggestion?: (p: ProfileWithAgent, i: number, sel: boolean) => React.ReactNode;
  renderAgentSuggestion?: (a: Agent, i: number, sel: boolean) => React.ReactNode;
  renderTaskSuggestion?: (t: TaskListItem, i: number, sel: boolean) => React.ReactNode;
  renderProjectSuggestion?: (p: Project, i: number, sel: boolean) => React.ReactNode;
}

/** Build suggestion sources for MentionTextArea from raw data and categories. */
export function buildMentionSources(
  opts: BuildMentionSourcesOptions,
): MentionSuggestionSource<unknown>[] {
  const {
    categories,
    formatMention: fmt = formatMention,
    renderProfileSuggestion: rp = renderProfileSuggestion,
    renderAgentSuggestion: ra = renderAgentSuggestion,
    renderTaskSuggestion: rt = renderTaskSuggestion,
    renderProjectSuggestion: rproj = renderProjectSuggestion,
  } = opts;
  const sources: MentionSuggestionSource<unknown>[] = [];
  if (categories.includes("profile")) {
    sources.push({
      label: "People",
      suggestions: opts.profiles,
      getInsertText: (p) => fmt("id", (p as ProfileWithAgent).id) + " ",
      filterSuggestions: (items, query: string) => {
        if (!query.trim()) return items;
        const q = query.toLowerCase();
        return items.filter((p) => {
          const prof = p as ProfileWithAgent;
          return (
            prof.username?.toLowerCase().startsWith(q) ||
            prof.displayName?.toLowerCase().includes(q) ||
            prof.displayName
              ?.toLowerCase()
              .split(/\s+/)
              .some((w: string) => w.startsWith(q))
          );
        });
      },
      renderItem: (p, _i, sel) => rp(p as ProfileWithAgent, _i, sel),
    });
  }
  if ((categories as readonly string[]).includes("agent")) {
    sources.push({
      label: "Agents",
      suggestions: opts.agents,
      getInsertText: (a) => fmt("agent", (a as Agent).id) + " ",
      filterSuggestions: (items, query: string) => {
        if (!query.trim()) return items;
        const q = query.toLowerCase();
        return items.filter((a) => {
          const agent = a as Agent;
          return (
            agent.name?.toLowerCase().includes(q) ||
            agent.username?.toLowerCase().startsWith(q) ||
            agent.profile?.displayName?.toLowerCase().includes(q) ||
            agent.profile?.username?.toLowerCase().startsWith(q)
          );
        });
      },
      renderItem: (a, _i, sel) => ra(a as Agent, _i, sel),
    });
  }
  if (categories.includes("task")) {
    sources.push({
      label: "Tasks",
      suggestions: opts.tasks,
      getInsertText: (t) => fmt("task", (t as TaskListItem).id) + " ",
      filterSuggestions: (items, query: string) => {
        if (!query.trim()) return items;
        const q = query.toLowerCase();
        return items.filter((t) => {
          const task = t as TaskListItem;
          return (
            task.title?.toLowerCase().includes(q) ||
            String(task.taskNumber ?? "")
              .toLowerCase()
              .includes(q)
          );
        });
      },
      renderItem: (t, _i, sel) => rt(t as TaskListItem, _i, sel),
    });
  }
  if (categories.includes("project")) {
    sources.push({
      label: "Projects",
      suggestions: opts.projects,
      getInsertText: (p) => fmt("project", (p as Project).id) + " ",
      filterSuggestions: (items, query: string) => {
        if (!query.trim()) return items;
        const q = query.toLowerCase();
        return items.filter((p) => (p as Project).name?.toLowerCase().includes(q));
      },
      renderItem: (p, _i, sel) => rproj(p as Project, _i, sel),
    });
  }
  return sources;
}
