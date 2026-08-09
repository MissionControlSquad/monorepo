import { ProjectWorkspaceDetailPage } from "@/views/ProjectWorkspaceDetailPage";

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectWorkspaceDetailPage projectId={projectId} />;
}
