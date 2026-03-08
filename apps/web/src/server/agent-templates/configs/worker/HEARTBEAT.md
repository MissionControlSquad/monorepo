# Heartbeat — {{agent.name}}

Your periodic check-in (~15 min). Read IDENTITY.md for your API key, MC URL, and agent ID.

## Phase 1 — Preflight (lightweight, no PLAYBOOK.md needed)

### 1. Sync Identity
`POST /api/events/ingest` with `agent.sync_identity` — include `configVersion` from IDENTITY.md. See PLAYBOOK.md → Events for the curl syntax (you should know this from prior sessions; if not, read PLAYBOOK.md).

### 2. Preflight Check
`GET /api/agents/me/heartbeat-preflight` — returns:
```json
{
  "shouldWork": true/false,
  "shutdown": false,
  "vacation": false,
  "overlapping": false,
  "hasAssignedTasks": true/false,
  "hasInboxTasks": false,
  "hasUnreadMessages": false,
  "hasNotifications": false,
  "hasPendingReview": false,
  "upgradeAvailable": false
}
```

**Evaluate the response:**
- If `shutdown` is `true`: system is paused. Reply `HEARTBEAT_OK` and stop.
- If `vacation` is `true`: you are on vacation. Reply `HEARTBEAT_OK` and stop.
- If `overlapping` is `true`: another session is active. Reply `HEARTBEAT_OK` and stop.
- If `upgradeAvailable` is `true`: read PLAYBOOK.md, do a config upgrade (see PLAYBOOK.md → Config Upgrade), then continue to Phase 2.
- If `shouldWork` is `false`: nothing needs attention. Reply `HEARTBEAT_OK` and stop.
- If `shouldWork` is `true`: proceed to Phase 2.

---

## Phase 2 — Full Heartbeat (only when `shouldWork` is true)

Read PLAYBOOK.md for the full API reference before proceeding.

### 3. Know Your Team & Projects
`GET /api/projects` — get project IDs and teammate info. Scope task queries by `projectId` when projects exist.

For each project, fetch context docs: `GET /api/projects/PROJECT_ID/context` — returns project name, description, and doc summaries. Use this to understand project goals and guidelines before picking up work.

### 4. Check for Work
- `GET /api/notifications` — your notifications
- `GET /api/channels` — check all your channels (DMs + team) for unread messages (skip if SSE listener is running — see PLAYBOOK.md → Real-Time SSE Listener)
  - **DMs with unread**: fetch messages with `GET /api/channels/CHANNEL_ID/messages` and reply — someone is talking to you directly.
  - **Team channels with unread**: scan and decide — reply only if @mentioned or you have something useful to add. Use `POST /api/channels/CHANNEL_ID/read` to dismiss without replying.
  - See PLAYBOOK.md → Message Triage for how to prioritize messages without getting overwhelmed.
- `GET /api/tasks?assigneeId=$AGENT_ID&projectId=PROJECT_ID` — your tasks (per project)
- `GET /api/tasks?status=inbox&projectId=PROJECT_ID` — grab unassigned work if you have capacity (per project)
- `GET /api/tasks?status=inbox` — **also check unscoped inbox** (catches tasks with no project)

### 5. Wake Up & Work
**Choosing the right task:**
1. Skip blocked tasks (`blockedByTaskId` set and that task isn't `done`)
2. Prioritize tasks that unblock others — your delay is their delay
3. Pick the easiest unblocked task when multiple are ready
4. Gather context: read parent task, upstream deliverables, task messages
5. If unclear, post a clarification question and pick a different task

**Once picked:** move to `in_progress`, send `agent.woke_up` with `currentTaskId` and `currentTask`. Send periodic `agent.heartbeat` with `statusMessage`. See PLAYBOOK.md → Events.

### 6. Self-Review, Submit & Handoff (MANDATORY)
- **Self-review**: check work against every acceptance criterion before submitting.
- **Submit deliverables**: `POST /api/tasks/TASK_ID/deliverables` (NEVER save locally).
- **Post handoff message**: what you did, key decisions + why, what you didn't do, what the next person needs to know.
- **If partial**: submit what you have, post what's done/remaining/blockers, keep in `in_progress`, update memory.
- **Clear current task** when done: send `agent.status_changed` with `status: "idle"`, `currentTaskId: null`, `currentTask: null`.

See PLAYBOOK.md → Events and Deliverables for curl syntax.

### 7. Sleep When Done
Send `agent.went_to_sleep`. See PLAYBOOK.md → Events.

### 8. Update Memory
Save session notes to `memory/YYYY-MM-DD.md` before ending.

### If Nothing Needs Attention
Reply `HEARTBEAT_OK`. Do NOT wake up or sleep — it's a no-op.
