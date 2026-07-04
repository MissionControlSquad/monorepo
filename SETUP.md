# Mission Control Setup Guide

## Architecture Overview

```
OpenClaw (manages agents, crons, heartbeats)
├── Commander Kia Hayes  - agent:main:main
├── Nova Quinn           - agent:research-seo:main
├── Aria Delacroix       - agent:content-writer:main
├── Sage Monroe          - agent:social-media:main
├── Lux Castellan        - agent:ux-designer:main
└── Rex Vanguard         - agent:frontend-dev:main
         │
    PostgreSQL Database (tasks, messages, notifications)
         │
    Next.js Web UI (dashboard at localhost:3000)
```

## Prerequisites

- OpenClaw installed (`openclaw` CLI available)
- Node.js 18+ installed
- PostgreSQL database (Neon recommended)

## Step 1: Set Up PostgreSQL Database

```bash
cd /Users/dharmendra/clawd/workstation/mission-control
npx prisma generate
npx prisma db push
```

This will:
1. Generate the Prisma client from the schema
2. Push the schema to the database
3. Database URL is configured in `web/.env.local`

## Step 2: Agents Self-Register

No manual agent setup needed. Each agent calls `agent.sync_identity` via the REST API on every heartbeat, reading their identity from `AGENT.md`. They'll appear in the dashboard after their first heartbeat.

If an agent changes their name or role in `AGENT.md`, it syncs automatically on next heartbeat.

## Step 3: Verify OpenClaw Agent Setup

Check agents are registered in OpenClaw:

```bash
openclaw agents list
```

### CRITICAL: Set Up Heartbeat Crons for ALL Agents

Every agent MUST have a heartbeat cron job in OpenClaw. Without it, the agent will never wake up, never check for tasks, and appear permanently offline in the dashboard.

**Verify crons exist:**

```bash
openclaw cron list
```

You should see **6 cron jobs** — one per agent. If any are missing, add them using the schedule below.

### Full Cron Schedule (all 6 agents)

Each agent fires every 15 minutes, staggered to avoid overlapping:

| Agent | OpenClaw ID | Cron Name | Schedule | Minutes |
|-------|-------------|-----------|----------|---------|
| Kia | `main` | `kia-heartbeat` | `0,15,30,45 * * * *` | :00 :15 :30 :45 |
| Lux | `ux-designer` | `lux-heartbeat` | `3,18,33,48 * * * *` | :03 :18 :33 :48 |
| Nova | `research-seo` | `scout-heartbeat` | `5,20,35,50 * * * *` | :05 :20 :35 :50 |
| Sage | `social-media` | `sage-heartbeat` | `7,22,37,52 * * * *` | :07 :22 :37 :52 |
| Aria | `content-writer` | `scribe-heartbeat` | `10,25,40,55 * * * *` | :10 :25 :40 :55 |
| Rex | `frontend-dev` | `rex-heartbeat` | `12,27,42,57 * * * *` | :12 :27 :42 :57 |

### Adding a Missing Cron Job

If an agent's cron is missing, add it:

```bash
openclaw cron add \
  --agent <OPENCLAW_AGENT_ID> \
  --name "<name>-heartbeat" \
  --schedule "<CRON_EXPR>" \
  --message "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK."
```

Example for a new agent "frontend-dev":
```bash
openclaw cron add \
  --agent frontend-dev \
  --name "rex-heartbeat" \
  --schedule "12,27,42,57 * * * *" \
  --message "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK."
```

### Onboarding a New Agent — Full Checklist

When adding a new agent to the team:

1. **Create workspace directory** — e.g. `~/clawd/agents/<role>/`
2. **Create required files** in the workspace:
   - `AGENT.md` — Identity, capabilities, API key
   - `HEARTBEAT.md` — What to do on each heartbeat
   - `WORKING.md` — Will be created by agent, but can be initialized
   - `MEMORY.md` — Persistent learnings (can start empty)
3. **Register in OpenClaw** — `openclaw agents add ...`
4. **Add heartbeat cron** — Pick a staggered minute offset (see schedule above)
5. **Verify cron fires** — `openclaw cron list` and wait for first heartbeat
6. **Update SETUP.md** — Add the new agent to the architecture diagram and cron table
7. **Update PLAYBOOK.md** — Add the agent to the team table
8. **Update TEAM.md** — Add agent profile
9. **Copy setup files to `agents-setup/`** — Keep the canonical copies in `mission-control/agents-setup/<agent>/`

### Agent Workspaces

All agent workspaces should exist at:
- Kia: `~/clawd/` (main workspace)
- Nova: `~/clawd/agents/scout/`
- Aria: `~/clawd/agents/scribe/`
- Sage: `~/clawd/agents/social/`
- Lux: `~/clawd/agents/designer/`
- Rex: `~/clawd/agents/builder/`

Each workspace should have:
- `AGENT.md` — Identity and capabilities
- `HEARTBEAT.md` — What to do on each heartbeat
- `WORKING.md` — Current task state (created by agent)
- `MEMORY.md` — Persistent learnings

## Step 4: Launch the Web UI

```bash
cd /Users/dharmendra/clawd/workstation/mission-control/web
npm install
npm run dev
```

Open http://localhost:3000 to see Mission Control.

## Step 5: Test the System

Create a task via the dashboard UI or REST API:

```bash
MC=http://localhost:3000
# Use the agent's API key (from Mission Control: Agents → agent → API key)
KEY="mc_<your_agent_api_key>"

# Get agent IDs
curl -s "$MC/api/agents" -H "Authorization: Bearer $KEY"

# Create a task
curl -s -X POST "$MC/api/tasks" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $KEY" \
  -d '{"title":"Write blog post about AI automation","description":"Target keyword: AI automation for startups. 1500 words.","assigneeIds":["<NOVA_ID>","<ARIA_ID>"],"priority":"high"}'
```

Then watch:
1. Nova picks up the task on next heartbeat, researches, posts findings
2. Aria reads Nova's research, drafts content, submits for review
3. Kia reviews and approves or requests changes

## Deploying Schema Changes

After modifying `prisma/schema.prisma`:

```bash
npx prisma generate
npx prisma db push
```

## Troubleshooting

**Agent shows as offline / never responds?**
1. `openclaw cron list` — does the agent have a cron job? If not, **this is the problem**. Add one (see Step 3).
2. Check the agent's workspace has `HEARTBEAT.md`
3. Check `WORKING.md` — if it says "First session pending", the agent has never fired
4. Try `openclaw cron run <CRON_ID>` to trigger a manual heartbeat

**Database issues?**
- Run `npx prisma generate` to regenerate the client
- Run `npx prisma db push` to sync the schema
- Check `web/.env.local` for correct `DATABASE_URL`

**Web UI not loading?**
- `cd web && npm install && npm run dev`
- Check browser console for errors

## Cost Optimization

- Use cheaper models (Haiku) for heartbeats
- Adjust heartbeat frequency (15 min default, increase if costs high)
- Add office hours via OpenClaw cron schedules
