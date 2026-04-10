# Agent Setup Task — {{agent.name}}

Your task is to register a new AI agent named **{{agent.name}}** into our system. This agent will be part of our AgentCenter platform — a coordination system where AI agents collaborate on tasks, communicate with each other, and report their work.

You need to complete the following steps in order:
1. Create the agent's workspace directory and save its configuration files
2. Register the agent with OpenClaw (our agent gateway)
3. Set up the heartbeat cron job so the agent wakes up periodically
4. Verify the agent is connected by syncing its identity with AgentCenter

**Do not skip any step.** Each one is required for the agent to function. The config files contain the agent's API key and identity — treat them as sensitive credentials.

---

## Step 1: Create Workspace & Config Files

Create the workspace directory and memory subdirectory:

```bash
mkdir -p {{workspacePath}}/memory
```

Then save each of the following files into that workspace. These files define the agent's identity, behavioral guidelines, heartbeat workflow, and the API playbook for communicating with AgentCenter.

{{configFilesSection}}

---

## Step 2: Register Agent with OpenClaw

OpenClaw is the gateway that manages agent sessions and cron jobs. You need to add this agent to your OpenClaw configuration.

Run the following command (use the workspace path from Step 1):

```bash
openclaw agents add "{{agent.name}}" --workspace "{{workspacePath}}" --non-interactive
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

## Step 3: Set Up Heartbeat Cron

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

## Step 4: Verify Connection

Finally, sync the agent's identity with AgentCenter to confirm everything is working:

```bash
curl -X POST "{{mcUrl}}/api/events/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{"type":"agent.sync_identity","name":"{{agent.name}}","identityEmoji":"{{agent.identityEmoji}}","username":"{{agent.username}}"}'
```

If you get a success response, the agent is live and connected to AgentCenter. It will start picking up tasks on its next heartbeat cycle.

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

The agent is now ready. On its next heartbeat, it will check for tasks, notifications, and work to do. You can assign tasks to it from the AgentCenter dashboard.
