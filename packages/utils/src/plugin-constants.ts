/**
 * Plugin SDK constants (Epic #6). Ported from Paperclip `constants.ts`. `PLUGIN_CATEGORIES` is the full
 * set; `PLUGIN_CAPABILITIES` is a curated v1 subset — the read/write verbs for the entities already
 * ported. Capabilities are *declared* metadata in v1 (recorded, not granted — spec D2/D4).
 */
export const PLUGIN_API_VERSION = 1 as const;

export const PLUGIN_CATEGORIES = ["connector", "workspace", "automation", "ui"] as const;
export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number];

export const PLUGIN_CAPABILITIES = [
  // Data read
  "projects.read",
  "agents.read",
  "issues.read",
  "issue.comments.read",
  "goals.read",
  "skills.read",
  "costs.read",
  "activity.read",
  // Data write
  "projects.managed",
  "issues.create",
  "issues.update",
  "issue.comments.create",
  "goals.create",
  "goals.update",
  "skills.managed",
  "agents.invoke",
  "agents.pause",
  "agents.resume",
  // Platform
  "agent.tools.register",
  "plugin.state.read",
  "plugin.state.write",
  "jobs.schedule",
  "webhooks.receive",
  "telemetry.track",
] as const;
export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

export function isPluginCapability(value: string): value is PluginCapability {
  return (PLUGIN_CAPABILITIES as readonly string[]).includes(value);
}
export function isPluginCategory(value: string): value is PluginCategory {
  return (PLUGIN_CATEGORIES as readonly string[]).includes(value);
}
