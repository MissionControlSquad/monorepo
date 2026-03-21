"use client";

import { useState } from "react";
import { useQuery } from "urql";
import { FolderOpen, Plus } from "lucide-react";
import { PROJECTS_QUERY } from "../../lib/graphql/queries";
import { useCurrentProject } from "../context/AppContext";
import { CreateProjectModal } from "../project/CreateProjectModal";
import { Button } from "../ui";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import type { Project } from "@agentcenter/types";

interface ProjectSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectSidebar({ isOpen, onClose }: ProjectSidebarProps) {
  const [projectsResult] = useQuery({ query: PROJECTS_QUERY });
  const projects = projectsResult.data?.projects;
  const { projectId, setProjectId } = useCurrentProject();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleSelect = (id: string | null) => {
    setProjectId(id);
    onClose();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto py-2">
        {/* All Projects */}
        <button
          onClick={() => handleSelect(null)}
          className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            projectId === null
              ? "bg-indigo-50 text-indigo-700 border-l-2 border-indigo-500"
              : "text-foreground hover:bg-muted border-l-2 border-transparent"
          }`}
        >
          <FolderOpen className="w-4 h-4 shrink-0" />
          All Projects
        </button>

        {/* Divider */}
        <div className="mx-4 my-1 border-t border-border" />

        {/* Project list */}
        {projects?.map((project: Project) => (
          <button
            key={project.id}
            onClick={() => handleSelect(project.id)}
            className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
              projectId === project.id
                ? "bg-indigo-50 text-indigo-700 font-medium border-l-2 border-indigo-500"
                : "text-foreground hover:bg-muted border-l-2 border-transparent"
            }`}
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span className="truncate">{project.name}</span>
          </button>
        ))}

        {!projects && <div className="px-4 py-3 text-xs text-muted-foreground">Loading...</div>}
        {projects?.length === 0 && (
          <div className="px-4 py-3 text-xs text-muted-foreground">No projects yet</div>
        )}
      </div>

      {/* New Project button */}
      <div className="border-t border-border p-3">
        <Button
          variant="ghost"
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-2 w-full justify-start px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted h-auto rounded-md"
        >
          <Plus className="w-4 h-4" />
          New Project
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 shrink-0 border-r border-border bg-background flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile overlay using Sheet */}
      <Sheet
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SheetContent side="left" className="w-64 p-0 gap-0">
          <SheetHeader className="px-4 py-3 border-b border-border">
            <SheetTitle className="text-sm">Projects</SheetTitle>
          </SheetHeader>
          {sidebarContent}
        </SheetContent>
      </Sheet>

      <CreateProjectModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </>
  );
}
