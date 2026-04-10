// Shared types and constants for the agent creation/setup flow.
// Used by both web (NewAgentWizard) and mobile (agent/create.tsx).

export type SetupMode = "auto" | "manual" | "delegate" | "cloud" | "desktop";

export const SETUP_MODE_LABELS: Record<SetupMode, string> = {
  auto: "Auto Setup",
  manual: "Manual Setup",
  delegate: "Delegate to Lead",
  cloud: "Deploy to Cloud",
  desktop: "Desktop App",
};

export interface AgentConfigFile {
  filename: string;
  content: string;
}

export interface AgentSetupResult {
  agent: { id: string; name?: string; role?: string; level?: string; [key: string]: unknown };
  apiKey: string;
  configFiles: AgentConfigFile[];
  bootstrapMessage: string;
  cronSchedule: string;
  cronMessage: string;
  cronCommand: string;
  workspacePath: string;
  openclawAgentConfig: { id: string; name: string; workspace: string };
  /** CLIs the desktop bootstrap must verify before setup starts. */
  requiredClis: string[];
  mcUrl: string;
}

// Ordered list of agent level keys — matches AGENT_LEVELS in constants.ts
export const AGENT_LEVEL_KEYS = ["intern", "specialist", "lead"] as const;

// Emoji options for agent identity picker
export const AGENT_EMOJI_PRESETS = [
  "🤖", "🦾", "🧠", "⚡", "🎯", "🔧", "🚀", "🌟", "🦊", "🐉",
  "🐺", "🦁", "🐻", "🦅", "🦋", "🌊", "🔥", "💎", "🛡️", "⚔️",
];
