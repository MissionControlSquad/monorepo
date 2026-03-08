"use client";

import { usePathname } from "next/navigation";
import { ProjectsPanel } from "@/components/layout/sidebar/panels/ProjectsPanel";

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDetailPage = pathname !== "/projects" && pathname?.startsWith("/projects/");

  return (
    <div className="flex-1 flex min-h-0">
      {isDetailPage && (
        <aside className="w-64 h-full border-r border-border bg-background shrink-0 overflow-hidden hidden lg:block">
          <ProjectsPanel />
        </aside>
      )}
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}
