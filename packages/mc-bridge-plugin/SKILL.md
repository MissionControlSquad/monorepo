# AgentCenter Bridge

Persistent WebSocket bridge between this OpenClaw instance and an AgentCenter Cloud server for live task delivery and real-time agent status reporting.

## What this plugin does at runtime

### On startup
1. **Resolves the `openclaw` binary** by searching `PATH`, common fixed locations (`/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`), all nvm-managed node versions (`~/.nvm/versions/node/*/bin`), and finally a login-shell `which` fallback. The result is cached for the lifetime of the process.
2. **Lists local agents** by running `openclaw agents list --json` via `child_process.execFile`. For each agent with a workspace path, reads `IDENTITY.md` from that workspace to obtain the agent's database ID.
3. Sends a `vm.hello` handshake over WebSocket containing: machine fingerprint (sha256 of hostname + MAC), plugin version, agent slugs, and hostname/platform/arch metadata.

### On connect (after `mc.welcome`)
- Starts a ping/pong keepalive loop.
- Starts the **AgentReporter**, which subscribes to `agent:statusChange`, `agent:message`, and `agent:taskDone` events from the OpenClaw runtime to stream live agent status back to AgentCenter Cloud.

### On task delivery (`mc.deliver_task`)
- Runs `openclaw agent --agent <slug> --message <notification>` as a **detached subprocess** (fire-and-forget) so the agent processes the task asynchronously.
- Deduplicates by `deliveryId` to prevent double-delivery on reconnect.
- Sends `vm.task_ack` back to AgentCenter once the process is spawned.

### Optional: auto-approve local CLI device pairings
When `autoApproveDevices: true` is set in the plugin config (default: **false**), the plugin runs `openclaw devices list --json` on startup and approves any pending requests that meet **all** of these criteria:
- `client === "cli"` (not a browser, desktop app, or remote agent)
- `ip` is loopback or unknown (`127.0.0.1`, `::1`, `localhost`, or empty)

Remote devices and non-CLI clients are **never** auto-approved regardless of this setting. This option exists to avoid a one-time friction step when the plugin first spawns the OpenClaw CLI as a subprocess; without it, the CLI may fall back to a slower embedded mode (~30–60s per call).

## Filesystem access
- Reads `IDENTITY.md` from each agent workspace path (reported by `openclaw agents list`).
- Reads/writes `PATH` environment variable to locate the `openclaw` binary.
- Scans `~/.nvm/versions/node/` directory listing (read-only, to find all nvm-installed node versions and their `bin/` directories).

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
| `autoApproveDevices` | — | false | Auto-approve pending local CLI device pairings on startup (see above). |

## Minimal config example

```json
{
  "agentCenterUrl": "wss://your-instance.agentcenter.cloud/live-gateway",
  "token": "<install-token-from-live-gateway-setup>"
}
```
