import { Suspense } from "react";
import { ProjectsPage } from "@/views/ProjectsPage";

export default function Projects() {
  return (
    <Suspense>
      <ProjectsPage />
    </Suspense>
  );
}
