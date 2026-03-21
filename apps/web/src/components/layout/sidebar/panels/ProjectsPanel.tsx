"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "urql";
import { PROJECTS_QUERY } from "../../../../lib/graphql/queries";
import { FolderKanban, Plus, Search } from "lucide-react";
import { CreateProjectModal } from "../../../project/CreateProjectModal";
import { SidebarPanelHeader } from "../SidebarPanelHeader";
import { SidebarSkeleton } from "../SidebarSkeleton";
import { SidebarEmptyState } from "../SidebarEmptyState";
import { Input as ShadcnInput } from "@/components/ui/shadcn/input";
import { Button } from "../../../ui";
import type { Project } from "@agentcenter/types";

export function ProjectsPanel() {
  const pathname = usePathname();
  const [projectsResult] = useQuery({ query: PROJECTS_QUERY });
  const projects = projectsResult.data?.projects;

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const activeProjectId = pathname?.match(/^\/projects\/([^/]+)/)?.[1] ?? null;

  const filtered = projects
    ?.filter((p: Project) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a: Project, b: Project) => {
      const aWeight = a.status === "archived" ? 2 : a.shutdownActive ? 1 : 0;
      const bWeight = b.status === "archived" ? 2 : b.shutdownActive ? 1 : 0;
      return aWeight - bWeight;
    });

  return (
    <div className="h-full flex flex-col">
      <SidebarPanelHeader
        title="Projects"
        count={projects?.length ?? 0}
        countLabel="project"
        action={
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setCreateOpen(true)}
            className="text-muted-foreground hover:text-primary hover:bg-primary/10"
            title="New project"
          >
            <Plus className="w-4 h-4" />
          </Button>
        }
      />

      {/* Search + filter */}
      <div className="flex-shrink-0 px-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <ShadcnInput
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted rounded-lg"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1 px-2">
        {projectsResult.fetching && !projects ? (
          <SidebarSkeleton count={3} height="h-9" />
        ) : !filtered || filtered.length === 0 ? (
          <SidebarEmptyState
            icon={<FolderKanban />}
            message={projects?.length === 0 ? "No projects yet" : "No matching projects"}
            action={
              projects?.length === 0 ? (
                <Link
                  href="/projects"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Create a project
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-0.5 mt-0.5">
            {filtered.map((p: Project) => {
              const isSelected = activeProjectId === p.id;
              return (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left transition-colors ${
                      isSelected
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <FolderKanban className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="truncate flex-1 min-w-0">{p.name}</span>
                    {p.status === "archived" && (
                      <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                        Archived
                      </span>
                    )}
                    {p.status !== "archived" && p.shutdownActive && (
                      <span className="text-[10px] font-medium text-warning shrink-0">Paused</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <CreateProjectModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
