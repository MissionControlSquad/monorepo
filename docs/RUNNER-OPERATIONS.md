# Runner operations guide

How to run agent work on a machine you control with the `@agentcenter/runner` daemon, and how the
control-plane runner surface (BYO hosts, cloud VMs, browser Cloud-Shell) fits together. Companion to
the design in [RUNNER-ARCHITECTURE.md](./RUNNER-ARCHITECTURE.md).

All of this is behind the **`RUNNERS`** feature flag (browser PTY is behind **`TERMINALS`**). Both
default off.

## The three ways work reaches a machine

| Mode | Who runs it | Reachability | Where credentials live |
|---|---|---|---|
| **Managed cloud VM** | We provision (Hetzner) | We SSH in | On our managed VM |
| **BYO host** | Your server (public IP + SSH) | We SSH in with a key you register | On your server |
| **Runner daemon** | Any machine, incl. behind NAT | **Outbound only** — no inbound, no SSH server needed | Never leave the machine |

Pick per workspace/agent. The control plane is identical; only *where the runner runs* differs.

---

## A. Runner daemon (`@agentcenter/runner`)

The daemon is **stateless** and **outbound-only**: it authenticates as an Agent, polls for work, runs
it locally, and reports results. It keeps nothing between tasks. Ideal for a personal computer, a
box behind NAT/firewall, or any machine where you don't want to open ports or expose SSH.

### Install

```sh
npm i -g @agentcenter/runner
```

### Configure

```sh
agentcenter-runner login \
  --api-url https://app.agentcenter.cloud \
  --api-key mc_xxxxxxxx \
  --runtime openclaw          # openclaw | codex | custom | shell
```

Credentials are written to `~/.agentcenter/runner.json` (mode 0600). You can instead supply them via
env: `AGENTCENTER_API_URL`, `AGENTCENTER_API_KEY`, `AGENTCENTER_RUNTIME`, `AGENTCENTER_POLL_MS`,
`AGENTCENTER_WORK_DIR`.

Config fields:

| Field | Env | Default | Meaning |
|---|---|---|---|
| `apiUrl` | `AGENTCENTER_API_URL` | — | Control-plane base URL |
| `apiKey` | `AGENTCENTER_API_KEY` | — | Agent API key (`mc_…`) |
| `runtime` | `AGENTCENTER_RUNTIME` | `openclaw` | How an agent task is launched |
| `runtimeTemplate` | — | — | argv (custom) or command string (shell) |
| `pollIntervalMs` | `AGENTCENTER_POLL_MS` | `5000` | Poll cadence |
| `workDir` | `AGENTCENTER_WORK_DIR` | `~/.agentcenter/work` | Scratch dir for task runs |

### Run

```sh
agentcenter-runner start                 # poll forever: raw commands + agent tasks
agentcenter-runner start --commands-only # only raw commands (skip agent tasks)
agentcenter-runner start --poll-ms 3000  # custom cadence
agentcenter-runner run-once              # process queued raw commands once, then exit
agentcenter-runner run-task <taskId>     # run one agent task end-to-end
```

### What each poll does

1. `GET /api/agents/me/heartbeat-preflight` — should-I-work hint.
2. `GET /api/runner/commands` — claim queued raw commands (atomic; no double-run) → run locally →
   `POST /api/runner/commands/:id/result`.
3. *(unless `--commands-only`)* `GET /api/queue?active=true` — for each item that references a task:
   `GET /api/agents/me/context?taskId=` → `git clone/pull` the repo → materialise the context bundle
   into the runtime's layout → spawn the runtime → `POST /api/tasks/:id/messages` with the output →
   `PATCH /api/tasks/:id` to `review` (success) or `blocked` (failure/timeout).

Nothing is persisted on the machine between tasks; each run's scratch files are per-task.

### Run as a service (systemd)

```ini
# /etc/systemd/system/agentcenter-runner.service
[Unit]
Description=AgentCenter runner
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=agentcenter
Environment=AGENTCENTER_API_URL=https://app.agentcenter.cloud
Environment=AGENTCENTER_API_KEY=mc_xxxxxxxx
Environment=AGENTCENTER_RUNTIME=openclaw
ExecStart=/usr/bin/agentcenter-runner start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl enable --now agentcenter-runner
journalctl -u agentcenter-runner -f
```

---

## B. BYO hosts (control-plane runs commands on your server)

Register a server once (Runners dashboard → BYO servers, or the `createRunnerHost` mutation); the
control plane can then run raw commands on it over direct SSH — **no agent runtime required**.

- The **private key is encrypted at rest** and is **never returned** by any API — not in the host
  list, not anywhere. Only its presence is visible.
- Commands run via `runCommandOnHost`; results (exit/stdout/stderr) are captured and shown with
  history. Output is capped so a runaway command can't store an unbounded row.

Use this when you want us to orchestrate but keep code + credentials on your own reachable server.

---

## C. Browser Cloud-Shell (PTY)

With `TERMINALS` on, open an interactive SSH shell to a managed VM from the dashboard (Terminals →
open session → **Connect**). Flow: a one-time `ts_` connect token is minted → the browser opens a
WebSocket to `/api/terminals/pty` → the server verifies the token, opens an SSH PTY, and relays bytes
both ways. Credentials target the endpoint; we relay the stream and store none.

---

## Runtimes

`runtime` selects how an **agent task** is launched (raw commands always run via the shell):

| Runtime | Launch | Bundle layout |
|---|---|---|
| `openclaw` (default) | `openclaw run --task <id>` | `AGENTS.md`, `IDENTITY.md`, `TASK.md`, `.openclaw/skills/*` |
| `codex` | `codex exec "<brief>"` | `AGENTS.md`, `IDENTITY.md`, `TASK.md`, `skills/*` |
| `custom` | your argv template (`{taskId}`/`{prompt}`/`{workspaceDir}` substituted) | generic |
| `shell` | your command string via the platform shell | generic |

OpenClaw stays the default; the others are drop-in — no engine change.

## Security model

- The daemon makes **only outbound HTTPS** — no inbound reachability, so it works behind any NAT and
  opens no ports.
- Auth everywhere is the agent's `Authorization: Bearer mc_…` key. Revoke the key to cut a runner off.
- BYO-host private keys are encrypted at rest and never returned.
- With the daemon, **code and credentials never leave the machine** except the task results you post.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `apiUrl/apiKey is required` | Not logged in and no env set → run `login` or export the env vars. |
| `403 Runners are not enabled` | `RUNNERS` flag is off for the workspace. |
| `401` on poll | Bad/revoked API key. |
| Task → `blocked` immediately | The runtime binary isn't installed / not on `PATH`; check the task message for the spawn error. |
| BYO command fails with a connect error | Host/port/user/key wrong, or the server isn't reachable from us. |
| Nothing runs | No queued commands and no tasks reference a queue item — the daemon logs `no work`. |
