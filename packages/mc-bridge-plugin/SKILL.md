# AgentCenter Bridge

Persistent WebSocket bridge between this OpenClaw instance and an AgentCenter Cloud server for live task delivery and real-time agent status reporting.

## What this plugin does at runtime

### On startup
1. **Lists local agents** via `api.config.agents.list` (OpenClaw's native config API). For each agent, resolves its database ID via `api.runtime.agent.resolveAgentIdentity()`.
2. Sends a `vm.hello` handshake over WebSocket containing: machine fingerprint (sha256 of hostname + MAC address), plugin version, agent slugs, and hostname/platform/arch metadata.

### On connect (after `mc.welcome`)
- Starts a ping/pong keepalive loop.
- Starts the **AgentReporter**, which subscribes to `agent:statusChange`, `agent:message`, and `agent:taskDone` events from the OpenClaw runtime to stream live agent status back to AgentCenter Cloud.

### On task delivery (`mc.deliver_task`)
- Calls `api.runtime.agent.runEmbeddedAgent()` to start a normal agent turn embedded in the daemon (no subprocess, no device pairing required). Resolves the agent's `workspaceDir` and `timeoutMs` via `api.runtime.agent.resolve*` helpers. Fire-and-forget — does not await completion.
- Falls back to `api.runtime.subagent.run()` if the agent is not found in `api.config.agents.list`.
- Deduplicates by `deliveryId` to prevent double-delivery on reconnect.
- Sends `vm.task_ack` back to AgentCenter once delivery is confirmed.

## Filesystem access
- None. All agent data is accessed via OpenClaw's native plugin API (`api.config`, `api.runtime`).

## Network access
- Opens a single persistent WebSocket connection to `agentCenterUrl` (set in plugin config).
- No other outbound network connections.

## Configuration

| Key | Required | Default | Description |
|-----|----------|---------|-------------|
| `agentCenterUrl` | ✓ | — | WebSocket URL of the AgentCenter live gateway, e.g. `wss://your-instance.agentcenter.cloud/live-gateway` |
| `token` | ✓ | — | Install token (obtained from AgentCenter Live Gateway setup). Replaced by a permanent per-machine token after first connection. |
| `fingerprint` | — | auto | Stable machine fingerprint. Leave blank to auto-derive from hostname + MAC. |
| `reconnectBaseMs` | — | 2000 | Reconnect backoff base interval (ms). |
| `reconnectMaxMs` | — | 30000 | Maximum reconnect backoff (ms). |

## Minimal config example

```json
{
  "agentCenterUrl": "wss://your-instance.agentcenter.cloud/live-gateway",
  "token": "<install-token-from-live-gateway-setup>"
}
```
