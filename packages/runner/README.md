# @agentcenter/runner

A standalone, **stateless**, **outbound-only** runner daemon for AgentCenter.

It runs on any machine — including a personal computer behind NAT with no SSH server and no public
IP — and makes only outbound HTTPS connections to AgentCenter Cloud. It polls for work, runs it
locally, and posts the results back. **Your code and credentials never leave the machine** except the
results you choose to return.

## Why stateless

The runner keeps no per-agent memory. For every task the control plane assembles a fresh **context
bundle** (identity + skills + instructions + the task, its project, and linked artifacts) and the
runner materialises it, runs the task, reports results, and discards everything. That is what lets
the same daemon run on any OS or machine with nothing to migrate or lose.

## Install

```sh
npm i -g @agentcenter/runner
```

## Use

```sh
# 1. Save your agent API key (authenticates as an Agent — Authorization: Bearer mc_…)
agentcenter-runner login --api-url https://app.agentcenter.cloud --api-key mc_xxx --runtime openclaw

# 2. Start polling (Ctrl-C to stop)
agentcenter-runner start --poll-ms 5000

# …or run a single pass and exit
agentcenter-runner run-once
```

Config is stored at `~/.agentcenter/runner.json` (or via `AGENTCENTER_API_URL` /
`AGENTCENTER_API_KEY` env). The runtime (`openclaw` | `codex` | `custom` | `shell`) selects how an
agent task is launched; OpenClaw is the default.

## What it talks to

All endpoints are header-authed (`Authorization: Bearer`), so nothing here is web-only:

- `GET /api/agents/me/heartbeat-preflight` — should-I-work hint
- `GET /api/runner/commands` — claim queued raw commands (atomic; no double-run)
- `POST /api/runner/commands/:id/result` — report exit/stdout/stderr
- `GET /api/agents/me/context?taskId=` — fetch the per-task context bundle
