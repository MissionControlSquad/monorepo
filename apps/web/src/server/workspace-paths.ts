/** Default workspace path relative to home: .openclaw/agents/<slug>/workspace */
export function getDefaultWorkspacePathSegments(agentSlug: string): string[] {
  return [".openclaw", "agents", agentSlug, "workspace"];
}

/** macOS/Linux: ~/.openclaw/agents/<slug>/workspace (always forward slashes) */
export function workspacePathUnix(agentSlug: string): string {
  return "~/" + getDefaultWorkspacePathSegments(agentSlug).join("/");
}
