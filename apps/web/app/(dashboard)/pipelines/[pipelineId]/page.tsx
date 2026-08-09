import { PipelineDetailPage } from "@/views/PipelineDetailPage";

export default async function PipelineDetail({
  params,
}: {
  params: Promise<{ pipelineId: string }>;
}) {
  const { pipelineId } = await params;
  return <PipelineDetailPage pipelineId={pipelineId} />;
}
