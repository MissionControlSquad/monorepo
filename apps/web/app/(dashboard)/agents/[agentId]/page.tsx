import { Suspense } from "react";
import { AgentDetailPage } from "@/views/AgentDetailPage";

export default async function AgentDetail({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  // Suspense boundary: AgentDetailPage reads `?tab=` / `&run=` via useSearchParams.
  return (
    <Suspense>
      <AgentDetailPage agentId={agentId} />
    </Suspense>
  );
}
