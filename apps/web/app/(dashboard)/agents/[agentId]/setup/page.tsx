import { AgentSetupPage } from "@/views/AgentSetupPage";

export default async function AgentSetup({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return <AgentSetupPage agentId={agentId} />;
}
