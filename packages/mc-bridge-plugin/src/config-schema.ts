/**
 * agentcenter-bridge plugin configuration schema.
 * Users set these values in their openclaw plugin config.
 */

export interface MCBridgeConfig {
  /** WebSocket URL of AgentCenter Cloud live gateway, e.g. wss://your-instance.agentcenter.cloud/live-gateway */
  agentCenterUrl: string;

  /**
   * Per-VM token (obtained from MC after first registration).
   * On first run, use an install token here — MC will issue a per-VM token in mc.welcome.
   * Replace this value with the per-VM token and restart.
   */
  token: string;

  /**
   * Stable machine fingerprint. Leave blank to auto-derive from hostname + MAC.
   * Override only if auto-detection is unreliable on this machine.
   */
  fingerprint?: string;

  /** Reconnect backoff base interval (ms). Default: 2000 */
  reconnectBaseMs?: number;

  /** Maximum reconnect backoff (ms). Default: 30000 */
  reconnectMaxMs?: number;

}
