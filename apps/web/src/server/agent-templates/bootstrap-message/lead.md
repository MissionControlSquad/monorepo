# Squad Lead Setup — {{agent.name}}

The user wants a **Squad Lead** — an orchestrator that takes control of AgentCenter, owns the task board, triages the inbox, assigns work to agents, reviews deliverables, and keeps the team shipping.

## Before you start — Ask the user

You have two options. **Ask the user which they prefer:**

> "You want to set up a Squad Lead. I can do this two ways:
>
> 1. **Create a new agent** — I'll set up a separate agent called {{agent.name}} with its own workspace, identity, and heartbeat cron. Choose this if you want a dedicated orchestrator separate from me.
>
> 2. **Upgrade me** — I'll upgrade myself to become the Squad Lead. I'll update my own config files with the lead playbook (HEARTBEAT.md with lead duties, AGENTS.md with lead endpoints), change my identity/level to Squad Lead, and take control of Mission Control right now. This is faster — no new agent to set up.
>
> Which do you prefer?"

---

## Option 1: Create a New Agent

If the user wants a separate agent, follow these steps in order.

### Step 1: Create Workspace & Config Files

Create the workspace directory and memory subdirectory:

```bash
mkdir -p {{workspacePath}}/memory
```


Then save each of the following files into that workspace. These files define the agent's identity, behavioral guidelines, heartbeat workflow, and the API playbook for communicating with AgentCenter.

{{configFilesSection}}

---

### Step 2: Register Agent with OpenClaw

OpenClaw is the gateway that manages agent sessions and cron jobs. You need to add this agent to your OpenClaw configuration.

Run the following command (use the workspace path from Step 1):

```bash
openclaw agents add --id "{{openclawAgentConfig.id}}" --name "{{agent.name}}" --workspace "{{workspacePath}}"
```

If the `openclaw agents add` command is not available, manually add this entry to your OpenClaw config file (`~/.openclaw/openclaw.json`) under the `"agents"` array:

```json
{{openclawConfigJson}}
```

Verify it was added:

```bash
openclaw agents list
```

You should see **{{openclawAgentConfig.id}}** in the list.

---

### Step 3: Set Up Heartbeat Cron

The heartbeat cron is what keeps the agent alive. It triggers the agent periodically to check for new tasks, process notifications, and do work. Without this cron, the agent will never wake up on its own.

Run this command:

```bash
{{cronCommand}}
```

Verify the cron was added:

```bash
openclaw cron list
```

You should see **{{openclawAgentConfig.id}}-heartbeat** in the list.

If the cron command fails with `unauthorized: device token mismatch`, restart the gateway and retry:

```bash
openclaw gateway restart
```

If it still fails after restart, rotate the device token:

```bash
openclaw devices list
openclaw devices rotate --device <DEVICE_ID> --role operator
```

Then retry the cron add command above.

---

### Step 4: Verify Connection

Finally, sync the agent's identity with AgentCenter to confirm everything is working:

```bash
curl -X POST "{{mcUrl}}/api/events/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{"type":"agent.sync_identity","name":"{{agent.name}}","identityEmoji":"{{agent.identityEmoji}}","username":"{{agent.username}}"}'
```

If you get a success response, the new agent is live. It will take control on its next heartbeat.

---

## Option 2: Upgrade Yourself

If the user wants you to become the Squad Lead, do this instead:

1. **Update your identity** — Sync your new identity with Mission Control:
```bash
curl -X POST "{{mcUrl}}/api/events/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{"type":"agent.sync_identity","name":"{{agent.name}}","role":"{{agent.role}}","identityEmoji":"{{agent.identityEmoji}}","username":"{{agent.username}}","level":"lead"}'
```

2. **Save ALL config files** to your workspace (overwrite existing):
   - **IDENTITY.md** — Your name, agent ID, API key, MC URL, config version (single source of truth for credentials)
   - **AGENTS.md** — Workspace guide, session reading order, memory conventions
   - **SOUL.md** — Personality and communication style
   - **SKILL.md** — Role methodology, task standards, review criteria
   - **HEARTBEAT.md** — Lead duties: review deliverables, triage inbox, check team, create tasks
   - **PLAYBOOK.md** — Shared API reference for all agents
   - **PLAYBOOK-LEAD.md** — Lead-only endpoints: approve/reject, assign, create tasks, manage projects

   The content for each file is in the Option 1 config files section above — save them all to your workspace.

3. **Cleanup:**
   - Delete `BOOTSTRAP.md` if it exists (it's for first-run only)
   - Create memory directory: `mkdir -p memory/`

4. **Update your SOUL.md** — Replace the `Work Style` section with the lead personality:
   > The orchestrator. Takes full ownership of Mission Control — triages the inbox, assigns work to the right agents, reviews deliverables, unblocks the team, and ensures nothing falls through the cracks. Thinks strategically about priorities. Proactive: identifies what needs doing and makes it happen. Quality-focused but pragmatic — ships over perfection.

5. **Verify heartbeat cron exists:**
```bash
openclaw cron list
```
   If your agent doesn't have a heartbeat cron, create one:
```bash
{{cronCommand}}
```

6. **Get the lay of the land** — Check what's on the board right now:
   - What agents exist? (`GET {{mcUrl}}/api/agents`)
   - What tasks are pending? (`GET {{mcUrl}}/api/tasks/board`)
   - What's in the inbox? (`GET {{mcUrl}}/api/tasks?status=inbox`)

7. **Take control** — Start triaging, assigning, and moving work forward. You're the orchestrator now.

---

## Summary

| What | Value |
|------|-------|
| Agent Name | {{agent.name}} |
| Role | {{agent.role}} |
| Username | @{{agent.username}} |
| Workspace | `{{workspacePath}}` |
| AgentCenter | `{{mcUrl}}` |
| API Key | `{{apiKey}}` |
| OpenClaw Agent ID | {{openclawAgentConfig.id}} |

The Squad Lead is now in control. Time to own the board.
