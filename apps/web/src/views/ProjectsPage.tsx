"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "urql";
import { PROJECTS_QUERY } from "../lib/graphql/queries";
import { FolderKanban, Plus, Search } from "lucide-react";
import { ProjectCard } from "../components/project/ProjectCard";
import { CreateProjectModal } from "../components/project/CreateProjectModal";
import { Breadcrumbs, Button, Input, EmptyState, SkeletonList, PageLayout } from "../components/ui";
import type { Project } from "@agentcenter/types";

export function ProjectsPage() {
  const router = useRouter();
  const [projectsResult] = useQuery({ query: PROJECTS_QUERY });
  const projects = projectsResult.data?.projects;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [search, setSearch] = useState("");

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
    <PageLayout>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Projects" }]} />
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
            <FolderKanban className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Projects</h1>
            <p className="text-sm text-muted-foreground">
              {projects?.length ?? 0} project{(projects?.length ?? 0) !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button variant="primary" size="md" icon={<Plus />} onClick={() => setIsCreateOpen(true)}>
          New Project
        </Button>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
        <div className="flex-1">
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search />}
          />
        </div>
      </div>

      {!projects ? (
        <SkeletonList count={3} height="h-20" variant="card" />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban />}
          title="No projects yet"
          description="Create a project to group tasks and team members by initiative."
          action={
            <Button
              variant="primary"
              size="md"
              icon={<Plus />}
              onClick={() => setIsCreateOpen(true)}
            >
              Create Project
            </Button>
          }
        />
      ) : filtered?.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="No matching projects"
          description="Try adjusting your search or filter."
        />
      ) : (
        <div className="space-y-3">
          {filtered?.map((project: { id: string; name: string; [key: string]: unknown }) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => router.push(`/projects/${project.id}`)}
            />
          ))}
        </div>
      )}

      <CreateProjectModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </PageLayout>
  );
}
