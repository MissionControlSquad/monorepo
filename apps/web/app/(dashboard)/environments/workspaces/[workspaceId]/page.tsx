import { ExecutionWorkspaceDetailPage } from "@/views/ExecutionWorkspaceDetailPage";

export default async function ExecutionWorkspaceDetail({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return <ExecutionWorkspaceDetailPage workspaceId={workspaceId} />;
}
