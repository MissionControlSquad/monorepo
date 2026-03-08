import { AgentProfilePage } from "@/views/AgentProfilePage";

export default async function AgentProfile({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return <AgentProfilePage agentId={agentId} />;
}
