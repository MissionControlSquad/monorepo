import { AgentEditPage } from "@/views/AgentEditPage";

export default async function AgentEdit({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return <AgentEditPage agentId={agentId} />;
}
