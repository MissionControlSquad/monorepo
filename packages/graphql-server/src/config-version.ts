/**
 * Current agent config version. Bump when HEARTBEAT, PLAYBOOK, or agent-facing APIs change.
 * Injected into generated agent workspace files; agents report it on sync_identity.
 * Used to show "Upgrade available" when agent.configVersion !== CURRENT_CONFIG_VERSION.
 */
export const CURRENT_CONFIG_VERSION = "5";
