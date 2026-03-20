"use client";

/**
 * Centralized mention resolution components.
 * Uses MentionDataContext for profile/agent/task/project maps so callers don't pass them.
 *
 * - MarkdownWithMentions: Full markdown rendering with clickable mention chips.
 *   Clicking a mention opens the profile sidebar or navigates to the task/project.
 *   Use for full content views (messages, descriptions, comments, docs).
 *
 * - MentionText: Plain-text mention resolution for snippets/previews.
 *   Use for truncated previews (kanban cards, search results, notification snippets).
 */
import { useRef, useEffect, useMemo } from "react";
import { MarkdownCommentPreview } from "./MarkdownCommentPreview";
import { useMentionData } from "../context/MentionDataContext";
import { useProfileSidebar } from "../context/ProfileSidebarContext";
import { useAgentDetail } from "../context/AgentDetailContext";
import { useTaskNavigation } from "../../hooks/useTaskNavigation";
import { useProjectDetail } from "../context/ProjectDetailContext";
import { resolveAllMentionHandles } from "@agentcenter/utils";

export interface MarkdownWithMentionsProps {
  content: string;
  className?: string;
}

/** Full markdown rendering with clickable mention chips.
 *  Profile/agent mentions open the profile sidebar.
 *  Task mentions navigate to the task page.
 */
export function MarkdownWithMentions({ content, className = "" }: MarkdownWithMentionsProps) {
  const { profileById, agentById, taskById, projectById } = useMentionData();
  const { openProfile } = useProfileSidebar();
  const { openAgent } = useAgentDetail();
  const openTask = useTaskNavigation();
  const { openProject } = useProjectDetail();
  const containerRef = useRef<HTMLDivElement>(null);

  // Delegated click handler for all .mention-link elements
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest?.(".mention-link") as HTMLElement | null;
      if (!target) return;

      e.preventDefault();
      e.stopPropagation();

      const profileId = target.getAttribute("data-profile-id");
      if (profileId) {
        openProfile(profileId);
        return;
      }
      const agentId = target.getAttribute("data-agent-id");
      if (agentId) {
        openAgent(agentId);
        return;
      }
      const taskId = target.getAttribute("data-task-id");
      if (taskId) {
        openTask(taskId);
        return;
      }
      const projectId = target.getAttribute("data-project-id");
      if (projectId) {
        openProject(projectId);
        return;
      }
    };

    el.addEventListener("click", handleClick, true);
    return () => el.removeEventListener("click", handleClick, true);
  }, [openProfile, openAgent, openTask, openProject]);

  return (
    <div ref={containerRef}>
      <MarkdownCommentPreview
        content={content}
        className={className}
        mentionProfileById={profileById}
        mentionAgentById={agentById}
        mentionTaskById={taskById}
        mentionProjectById={projectById}
      />
    </div>
  );
}

export interface MentionTextProps {
  content: string;
  className?: string;
}

/** Plain-text mention resolution for snippets/previews. Resolves @[type:id] to readable names. */
export function MentionText({ content, className }: MentionTextProps) {
  const { profileById, agentById, taskById, projectById } = useMentionData();
  const resolved = useMemo(
    () => resolveAllMentionHandles(content, { profileById, agentById, taskById, projectById }),
    [content, profileById, agentById, taskById, projectById],
  );
  return <span className={className}>{resolved}</span>;
}
