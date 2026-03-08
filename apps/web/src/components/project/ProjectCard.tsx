"use client";

import { useQuery } from "urql";
import { PROJECT_QUERY, TASKS_BY_PROJECT_QUERY } from "../../lib/graphql/queries";
import { ListTodo } from "lucide-react";
import Link from "next/link";
import { ProfileAvatar } from "../ui/ProfileAvatar";
import { Badge } from "../ui";
import type { Project, ProjectMember } from "@/lib/types";

interface ProjectCardProps {
  project: Project;
  onClick?: () => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const [projectDetailResult] = useQuery({
    query: PROJECT_QUERY,
    variables: { id: project.id },
  });
  const projectDetail = projectDetailResult.data?.project;

  const [projectTasksResult] = useQuery({
    query: TASKS_BY_PROJECT_QUERY,
    variables: { projectId: project.id },
  });
  const projectTasks = projectTasksResult.data?.tasksByProject;

  const taskCount = projectTasks?.length ?? 0;
  const members = projectDetail?.members ?? [];

  const isArchived = project.status === "archived";
  const isShutdown = project.shutdownActive === true;

  const className = `block w-full text-left rounded-xl border shadow-sm p-5 transition-all group ${
    isArchived
      ? "bg-muted border-border opacity-60 hover:opacity-80"
      : isShutdown
        ? "bg-warning-muted/50 border-warning/30 hover:border-warning/40 hover:shadow-md"
        : "bg-background border-border hover:border-border hover:shadow-md"
  }`;

  const Wrapper = onClick ? "button" : Link;
  const wrapperProps = onClick
    ? { onClick, className, type: "button" as const }
    : { href: `/projects/${project.id}`, className };

  return (
    <Wrapper {...(wrapperProps as any)}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-base font-semibold text-foreground group-hover:text-indigo-600 transition-colors truncate">
            {project.name}
          </h3>
          {isArchived && (
            <Badge variant="gray" size="sm">
              Archived
            </Badge>
          )}
          {isShutdown && !isArchived && (
            <Badge variant="yellow" size="sm">
              Paused
            </Badge>
          )}
        </div>
        <Badge variant="gray" size="sm">
          <ListTodo className="w-3 h-3" />
          {taskCount}
        </Badge>
      </div>

      {project.description && (
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{project.description}</p>
      )}

      {/* Member avatars */}
      <div className="flex items-center gap-2">
        <div className="flex -space-x-1.5">
          {members.slice(0, 5).map((member: ProjectMember) => (
            <ProfileAvatar
              key={member.id}
              profileId={member.profileId}
              size="sm"
              className="ring-2 ring-white"
            />
          ))}
          {members.length > 5 && (
            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground ring-2 ring-white">
              +{members.length - 5}
            </div>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {members.length} member{members.length !== 1 ? "s" : ""}
        </span>
      </div>
    </Wrapper>
  );
}
