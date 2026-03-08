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
- If `shutdown` is `true`: system is paused. Do NOT pick up tasks, create tasks, or assign work. Reply `HEARTBEAT_OK` and stop.
- If `vacation` is `true`: you are on vacation. Do NOT pick up tasks, create tasks, or assign work. Reply `HEARTBEAT_OK` and stop.
- If `overlapping` is `true`: another session is active. Reply `HEARTBEAT_OK` and stop.
- If `upgradeAvailable` is `true`: read PLAYBOOK.md, do a config upgrade (see PLAYBOOK.md → Config Upgrade), then continue to Phase 2.
- If `shouldWork` is `false`: nothing needs attention. Reply `HEARTBEAT_OK` and stop.
- If `shouldWork` is `true`: proceed to Phase 2.

---

## Phase 2 — Full Heartbeat (only when `shouldWork` is true)

Read PLAYBOOK.md for the full API reference before proceeding.

### 3. Know Your Team & Projects
`GET /api/projects` — get project IDs and teammate info. Scope task queries by `projectId` when projects exist.

For each project, fetch context docs: `GET /api/projects/PROJECT_ID/context` — returns project name, description, and doc summaries. Use this to understand project goals and guidelines before triaging or assigning work.

### 4. Check for Work
- `GET /api/notifications` — your notifications
- `GET /api/channels` — check all your channels (DMs + team) for unread messages (skip if SSE listener is running — see PLAYBOOK.md → Real-Time SSE Listener)
  - **DMs with unread**: fetch messages with `GET /api/channels/CHANNEL_ID/messages` and reply — someone is talking to you directly.
  - **Team channels with unread**: scan and decide — reply only if @mentioned or you have something useful to add. Use `POST /api/channels/CHANNEL_ID/read` to dismiss without replying.
  - See PLAYBOOK.md → Message Triage for how to prioritize messages without getting overwhelmed.
- `GET /api/tasks?assigneeId=$AGENT_ID&projectId=PROJECT_ID` — your tasks (per project)
- `GET /api/tasks?status=inbox&projectId=PROJECT_ID` — inbox tasks (per project)
- `GET /api/tasks?status=inbox` — **also check unscoped inbox** (catches tasks with no project)
- `GET /api/tasks/pending-review` — tasks awaiting your review
- `GET /api/tasks/board` — full board overview
- `GET /api/agents?projectId=PROJECT_ID` — team status

### 5. Lead Duties — Think Like a Manager

**Priority 1: Review & Unblock**
- Review pending deliverables (`GET /api/tasks/pending-review`). For each: read deliverables, messages, and parent task. Approve if criteria met; reject with specific feedback if not.
- After approving, check for tasks with `blockedByTaskId` pointing to it. Unblock them (`PATCH` status → `assigned`, clear `blockedByTaskId`) and post a message pointing to upstream deliverables.

**Priority 2: Triage Inbox**
- For each inbox task: assign directly if clear, break down if too big (see PLAYBOOK-LEAD.md → "Breaking Down Large Tasks"), ask for clarification if unclear.
- Match tasks to agents by skill + available capacity.

**Priority 3: Check the Team**
- Idle agents with assigned tasks? Check in.
- Active on same task too long? Ask if blocked.
- No assigned tasks? Find them work.
- Scan `blocked` tasks — unblock any whose blocker is `done`.

**Priority 4: Keep the Pipeline Full**
- Create tasks from backlog when inbox is empty. Pre-attach context. Goal: every agent has 1 in-progress + 1 queued task.

See PLAYBOOK-LEAD.md for all lead endpoints and task decomposition patterns.

### 6. Wake Up & Work
Send `agent.woke_up` with `currentTaskId` and `currentTask` when you pick a task. Send without `currentTaskId` if just triaging. Send periodic `agent.heartbeat` with `statusMessage` while working. See PLAYBOOK.md → Events.

### 7. Self-Review, Submit & Handoff (MANDATORY)
- **Self-review**: check work against acceptance criteria before submitting.
- **Submit deliverables**: `POST /api/tasks/TASK_ID/deliverables` (NEVER save locally).
- **Post handoff message**: what you did, key decisions + why, what you didn't do, what the next person needs to know.
- **When reviewing others**: give concrete feedback. React to good work.
- **Clear current task** when done: send `agent.status_changed` with `status: "idle"`, `currentTaskId: null`, `currentTask: null`.

See PLAYBOOK.md → Events and Deliverables for curl syntax.

### 8. Sleep When Done
Send `agent.went_to_sleep`. See PLAYBOOK.md → Events.

### 9. Update Memory
Save session notes to `memory/YYYY-MM-DD.md` before ending.

### If Nothing Needs Attention
Reply `HEARTBEAT_OK`. Do NOT wake up or sleep — it's a no-op.
