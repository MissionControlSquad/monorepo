"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useQuery } from "urql";
import { PROJECTS_QUERY, PROJECT_QUERY } from "../../lib/graphql/queries";
import { ChevronDown, FolderOpen, Plus, Check, Settings2, Search } from "lucide-react";
import { useCurrentProject } from "../context/AppContext";
import { CreateProjectModal } from "../project/CreateProjectModal";
import { Button } from "@/components/ui";
import type { Project } from "../../lib/types";

export function ProjectSwitcher({ fullWidth }: { fullWidth?: boolean } = {}) {
  const { projectId, setProjectId } = useCurrentProject();
  const [projectsResult] = useQuery({ query: PROJECTS_QUERY });
  const projects = projectsResult.data?.projects;

  const [projectResult] = useQuery({
    query: PROJECT_QUERY,
    variables: { id: projectId! },
    pause: !projectId,
  });
  const project = projectResult.data?.project;

  const [open, setOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    // Auto-focus search input when dropdown opens
    requestAnimationFrame(() => searchInputRef.current?.focus());
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const select = useCallback(
    (id: string | null) => {
      setProjectId(id);
      setOpen(false);
    },
    [setProjectId],
  );

  const filteredProjects = projects?.filter((p: Project) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const label = projectId && project ? project.name : "All Projects";

  return (
    <>
      <div className="relative" ref={ref}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          icon={<FolderOpen className="w-4 h-4 text-muted-foreground" />}
          iconRight={
            <ChevronDown
              className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            />
          }
          className={`justify-between ${fullWidth ? "w-full" : "max-w-[200px]"}`}
        >
          <span className="truncate">{label}</span>
        </Button>

        {open && (
          <div className="absolute left-0 top-full mt-1.5 w-56 bg-background rounded-lg border border-border shadow-lg z-50 py-1">
            {/* Search input */}
            <div className="px-2 pb-1.5 pt-1">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search projects..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-7 pr-2 py-1.5 text-sm bg-muted rounded-md border-none outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto">
              {/* All Projects */}
              {!search && (
                <>
                  <button
                    onClick={() => select(null)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1 min-w-0 text-left">All Projects</span>
                    {projectId === null && (
                      <Check className="w-3.5 h-3.5 text-indigo-600 ml-auto shrink-0" />
                    )}
                  </button>
                  {projects && projects.length > 0 && (
                    <div className="mx-2 my-1 border-t border-border" />
                  )}
                </>
              )}

              {filteredProjects?.map((p: Project) => (
                <button
                  key={p.id}
                  onClick={() => select(p.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-left">{p.name}</span>
                  {p.status === "archived" && (
                    <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                      Archived
                    </span>
                  )}
                  {p.status !== "archived" && p.shutdownActive && (
                    <span className="text-[10px] font-medium text-warning shrink-0">Paused</span>
                  )}
                  {projectId === p.id && (
                    <Check className="w-3.5 h-3.5 text-indigo-600 ml-auto shrink-0" />
                  )}
                </button>
              ))}

              {search && filteredProjects?.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">No projects found</p>
              )}
            </div>

            <div className="mx-2 my-1 border-t border-border" />

            {/* New Project */}
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setIsCreateOpen(true);
              }}
              className="w-full justify-start gap-2 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 h-auto font-normal rounded-none"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>New Project</span>
            </Button>

            <div className="mx-2 my-1 border-t border-border" />

            {/* Manage Projects */}
            <Link
              href="/projects"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              <Settings2 className="w-4 h-4 shrink-0" />
              <span>Manage Projects</span>
            </Link>
          </div>
        )}
      </div>

      <CreateProjectModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </>
  );
}
