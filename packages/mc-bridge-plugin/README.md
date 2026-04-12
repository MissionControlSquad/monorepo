# AgentCenter Bridge

OpenClaw plugin that creates a persistent WebSocket connection between your OpenClaw instance and [AgentCenter Cloud](https://agentcenter.cloud), enabling real-time task delivery and agent status reporting.

## Install

```bash
openclaw plugins install clawhub:@agentcenter/agentcenter-bridge
```

## Configure

Add the following to your `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "agentcenter-bridge": {
        "enabled": true,
        "config": {
          "agentCenterUrl": "wss://your-instance.agentcenter.cloud/live-gateway",
          "token": "<setup-token-from-agentcenter>"
        }
      }
    }
  }
}
```

Then restart OpenClaw. The plugin connects automatically and prints a permanent token on first registration — replace the setup token with that permanent token in your config.

## Config options

| Field | Required | Description |
|---|---|---|
| `agentCenterUrl` | Yes | WebSocket URL of your AgentCenter Cloud live gateway |
| `token` | Yes | Setup token from the AgentCenter Live Gateway wizard |
| `fingerprint` | No | Stable machine ID. Auto-derived from hostname + MAC if omitted |
| `reconnectBaseMs` | No | Reconnect backoff base in ms. Default: `2000` |
| `reconnectMaxMs` | No | Maximum reconnect backoff in ms. Default: `30000` |

## License

MIT — see [LICENSE](./LICENSE)
