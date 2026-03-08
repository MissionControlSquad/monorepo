import { ProjectDetailPage } from "@/views/ProjectDetailPage";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectDetailPage projectId={projectId} />;
}
