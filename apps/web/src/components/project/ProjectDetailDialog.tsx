"use client";

import { useQuery } from "urql";
import { PROJECT_QUERY, TASKS_BY_PROJECT_QUERY } from "../../lib/graphql/queries";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/shadcn/dialog";
import { X, FolderKanban, ListTodo, Users } from "lucide-react";
import { ProfileAvatar } from "../ui/ProfileAvatar";
import Link from "next/link";
import { Button, Badge } from "../ui";
import type { Project, ProjectMember, TaskListItem } from "@agentcenter/types";

interface ProjectDetailDialogProps {
  projectId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskClick?: (taskId: string) => void;
}

function ProjectDetailContent({
  projectId,
  onClose,
  onTaskClick,
}: {
  projectId: string;
  onClose: () => void;
  onTaskClick?: (taskId: string) => void;
}) {
  const [projectResult] = useQuery({
    query: PROJECT_QUERY,
    variables: { id: projectId },
  });
  const project = projectResult.data?.project as Project;

  const [tasksResult] = useQuery({
    query: TASKS_BY_PROJECT_QUERY,
    variables: { projectId },
  });
  const tasks = tasksResult.data?.tasksByProject ?? [];

  if (projectResult.fetching) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-warning border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Project not found.</p>
        <Button
          variant="link"
          size="sm"
          onClick={onClose}
          className="mt-3 px-0 text-indigo-600 hover:text-indigo-700"
        >
          Close
        </Button>
      </div>
    );
  }

  const members = project.members ?? [];

  return (
    <>
      {/* Close button */}
      <div className="absolute top-3 right-3 z-10">
        <Button variant="ghost" size="sm" icon={<X />} onClick={onClose} />
      </div>

      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-warning/15 text-warning flex items-center justify-center">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-semibold text-foreground truncate">
              {project.name}
            </DialogTitle>
            {project.status && (
              <Badge variant="gray" className="mt-0.5">
                {project.status}
              </Badge>
            )}
          </div>
        </div>
        {project.description && (
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            {project.description}
          </p>
        )}
      </div>

      {/* Members */}
      {members.length > 0 && (
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Members ({members.length})</h3>
          </div>
          <div className="space-y-2">
            {members.map((member: ProjectMember) => (
              <div key={member.id} className="flex items-center gap-2.5">
                <ProfileAvatar profileId={member.profileId} size="sm+" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {member.profile?.agent?.name ?? member.profile?.displayName ?? "Unknown"}
                  </p>
                  {member.profile?.agent?.role && (
                    <p className="text-xs text-muted-foreground truncate">
                      {member.profile.agent.role}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tasks */}
      <div className="px-6 py-4">
        <div className="flex items-center gap-2 mb-3">
          <ListTodo className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Tasks ({tasks.length})</h3>
        </div>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No tasks yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {tasks.slice(0, 10).map((task: TaskListItem) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => {
                    onTaskClick?.(String(task.taskNumber ?? task.id));
                    onClose();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    {task.taskNumber != null && (
                      <span className="text-xs font-medium text-muted-foreground shrink-0">
                        #{task.taskNumber}
                      </span>
                    )}
                    <span className="text-sm text-foreground truncate group-hover:text-indigo-600 transition-colors">
                      {task.title || "Untitled"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">
                    {task.status?.replace(/_/g, " ")}
                  </span>
                </button>
              </li>
            ))}
            {tasks.length > 10 && (
              <li className="text-xs text-muted-foreground px-3 py-1">+{tasks.length - 10} more</li>
            )}
          </ul>
        )}
      </div>

      {/* Footer link */}
      <div className="px-6 pb-5 pt-2 border-t border-border">
        <Link
          href="/projects"
          onClick={onClose}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          View all projects
        </Link>
      </div>
    </>
  );
}

export function ProjectDetailDialog({
  projectId,
  isOpen,
  onClose,
  onTaskClick,
}: ProjectDetailDialogProps) {
  if (!isOpen || !projectId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md sm:max-w-md p-0 gap-0 max-h-[80vh] overflow-y-auto"
        showCloseButton={false}
      >
        <ProjectDetailContent projectId={projectId} onClose={onClose} onTaskClick={onTaskClick} />
      </DialogContent>
    </Dialog>
  );
}
