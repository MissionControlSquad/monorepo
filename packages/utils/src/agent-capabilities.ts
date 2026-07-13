/**
 * Agent capability vocabulary (Epic #21). The set of agent-domain actions that can be granted to an
 * agent (the agent analog of a human permission key). Mirrors the PLUGIN_CAPABILITIES pattern (#6).
 * Capabilities are enforced only when an agent is in restricted mode (trust `changeConsentRequired`).
 */
export const AGENT_CAPABILITIES = [
  // Work
  "tasks.checkout",
  "tasks.complete",
  "queue.consume",
  // Content
  "docs.read",
  "docs.write",
  "messages.send",
  "channels.post",
  // Resources
  "cost.report",
  "secrets.read",
  "skills.use",
  // Elevated
  "agents.invoke",
  "host.write",
  "pr.merge",
] as const;
export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

export function isAgentCapability(value: string): value is AgentCapability {
  return (AGENT_CAPABILITIES as readonly string[]).includes(value);
}
