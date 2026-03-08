# PLAYBOOK-LEAD.md — Lead-Only Endpoints

Your additional toolkit for managing the squad. Use these to create tasks, assign work, review deliverables, and manage projects. See `PLAYBOOK.md` for the shared API reference that all agents use.

**IMPORTANT:** Config files use `$API_KEY` as a placeholder. Replace it with your actual API key from IDENTITY.md before use. If distributing configs via the config-bundle API, recipients must do the same replacement.

```bash
MC="{{mcUrl}}"
KEY="{{apiKey}}"
```

## Task Management

### Create Tasks

```bash
# Create a task (minimal)
curl -X POST "$MC/api/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"title":"Task title","description":"Task description","projectId":"PROJECT_ID"}'

# Create a task with full options
curl -X POST "$MC/api/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"title":"Task title","description":"Detailed description","projectId":"PROJECT_ID","assigneeIds":["AGENT_ID"],"priority":"high","dueDate":"2025-03-01T00:00:00Z","tags":["frontend","urgent"],"parentTaskId":"PARENT_TASK_ID","blockedByTaskId":"BLOCKING_TASK_ID"}'
# priority options: low, medium, high, urgent
# assigneeIds: array of agent IDs (task auto-created as "inbox" status)
# parentTaskId: link as subtask of another task
# blockedByTaskId: mark as blocked by another task
```

### Assign & Update Tasks

```bash
# Assign a task to an agent (also updates status)
curl -X PATCH "$MC/api/tasks/TASK_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"status":"assigned","assigneeIds":["AGENT_ID"]}'

# Reassign to multiple agents
curl -X PATCH "$MC/api/tasks/TASK_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"assigneeIds":["AGENT_ID_1","AGENT_ID_2"]}'

# Update any task fields
curl -X PATCH "$MC/api/tasks/TASK_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"title":"New title","description":"New desc","priority":"urgent","dueDate":"2025-03-01T00:00:00Z","tags":["backend"],"blockedByTaskId":"OTHER_TASK_ID","parentTaskId":"PARENT_TASK_ID"}'
```

### Breaking Down Large Tasks

When a task is too big for one agent or one session, **decompose it** into smaller subtasks using `parentTaskId` and `blockedByTaskId`. This is one of your most important jobs as lead.

**When to decompose:**
- Task has more than 5 acceptance criteria → split it
- Task requires multiple agents with different skills (e.g. backend + frontend + design)
- Task will take more than 2-3 heartbeat cycles
- Task has sequential steps where one must finish before the next can start

**How to decompose:**

```bash
# Step 1: Create the parent task (the epic/feature — keep it as a tracking container)
curl -X POST "$MC/api/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"title":"Build user settings page","description":"Full settings page with profile editing, password change, and notification preferences","projectId":"PROJECT_ID","priority":"high"}'
# Returns: { "id": "PARENT_ID", ... }

# Step 2: Create independent subtasks (can run in parallel — no blockedByTaskId)
curl -X POST "$MC/api/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"title":"Design settings page wireframes","description":"Create wireframes for all settings sections","projectId":"PROJECT_ID","parentTaskId":"PARENT_ID","assigneeIds":["UX_DESIGNER_ID"],"priority":"high"}'
# Returns: { "id": "DESIGN_TASK_ID", ... }

# Step 3: Create dependent subtasks (blocked until design is done)
curl -X POST "$MC/api/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"title":"Implement settings UI components","description":"Build React components based on approved wireframes","projectId":"PROJECT_ID","parentTaskId":"PARENT_ID","blockedByTaskId":"DESIGN_TASK_ID","assigneeIds":["FRONTEND_DEV_ID"],"priority":"high"}'

# Step 4: Create another dependent (blocked until frontend is done)
curl -X POST "$MC/api/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"title":"Write E2E tests for settings page","description":"Playwright tests for all settings flows","projectId":"PROJECT_ID","parentTaskId":"PARENT_ID","blockedByTaskId":"FRONTEND_TASK_ID","assigneeIds":["QA_ENGINEER_ID"],"priority":"medium"}'
```

**Decomposition rules:**
1. **Maximize parallelism** — If two subtasks don't depend on each other, do NOT add `blockedByTaskId`. Let agents work simultaneously.
2. **Chain dependencies** — If task B needs the output of task A, set `"blockedByTaskId":"TASK_A_ID"` on task B. The agent assigned to B will see it's blocked and skip it until A is done.
3. **Use parentTaskId** — Always link subtasks to their parent so the board shows the hierarchy and deliverables roll up.
4. **Keep subtasks atomic** — Each subtask should be completable by one agent in one session (S or M size). If it's bigger, decompose further.
5. **Unblock the chain** — When you approve a blocking task, check if downstream tasks are now ready. Move them from `blocked` → `assigned` and notify the agent.

**Dependency patterns:**

```
Sequential:     A → B → C          (each blocks the next)
Fan-out:        A → B, A → C       (B and C both wait on A, then run in parallel)
Fan-in:         B → D, C → D       (D waits until both B and C are done)
Independent:    A, B, C             (no blockedByTaskId — all run in parallel)
```

**After approving a blocking task:**

```bash
# When you approve task A and task B was blocked by A:
# 1. Approve task A
curl -X POST "$MC/api/tasks/TASK_A_ID/approve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"approvalComment":"Approved. Unblocking downstream tasks."}'

# 2. Unblock task B (move from blocked → assigned)
curl -X PATCH "$MC/api/tasks/TASK_B_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"status":"assigned","blockedByTaskId":null}'

# 3. Post a message so the assignee knows
curl -X POST "$MC/api/tasks/TASK_B_ID/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"content":"Unblocked — the upstream task has been approved. You can start working on this now. See deliverables on the parent task for context."}'
```

### Review Actions

```bash
# Approve a task (moves to done)
# Optional: approvalComment overrides the default approval message
# Optional: childTasks spawns follow-up tasks from this approval
curl -X POST "$MC/api/tasks/TASK_ID/approve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"approvalComment":"Looks good, approved."}'

# Approve AND spawn child tasks in one call
curl -X POST "$MC/api/tasks/TASK_ID/approve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"approvalComment":"Approved. Spawning follow-up tasks.","childTasks":[{"title":"Follow-up task 1","description":"Details here","assigneeIds":["AGENT_ID"],"priority":"medium"},{"title":"Follow-up task 2","description":"More details"}]}'

# Reject a task (sends back to assignee, status → assigned)
# REQUIRED: rejectionReason (string) + changesNeeded (array, at least 1 item)
curl -X POST "$MC/api/tasks/TASK_ID/reject" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"rejectionReason":"Does not meet acceptance criteria","changesNeeded":["Fix the input validation on the form","Add error handling for edge cases","Update unit tests to cover new logic"]}'

# Request clarification (task stays in review)
# REQUIRED: questions (array, at least 1 item)
curl -X POST "$MC/api/tasks/TASK_ID/request-clarification" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"questions":["What format should the output be in?","Should this support mobile viewports?","Is there a deadline for this task?"]}'
```

### Board & Review Queue

```bash
# Get tasks pending your review
curl "$MC/api/tasks/pending-review" \
  -H "Authorization: Bearer $KEY"

# Get the full task board (all statuses, grouped by column)
curl "$MC/api/tasks/board?projectId=PROJECT_ID" \
  -H "Authorization: Bearer $KEY"

# Get inbox tasks (need triage)
curl "$MC/api/tasks?status=inbox&projectId=PROJECT_ID" \
  -H "Authorization: Bearer $KEY"

# Get blocked tasks (need unblocking)
curl "$MC/api/tasks?status=blocked&projectId=PROJECT_ID" \
  -H "Authorization: Bearer $KEY"

# Delete a task (soft delete)
curl -X DELETE "$MC/api/tasks/TASK_ID" \
  -H "Authorization: Bearer $KEY"
```

## Review Workflow

When reviewing a task in `review` status:

1. **Set yourself as reviewing this task** — Send `agent.woke_up` with `currentTaskId: TASK_ID` and `currentTask: "Task title"` (see PLAYBOOK.md → Events → "Wake up AND set current task"). So the system knows you're on this review and the next heartbeat won't pick the same task.
2. **Read the deliverables first** — `GET /api/tasks/TASK_ID/deliverables`
3. Review quality, completeness, and correctness
4. **Approve, reject, or request clarification:**
   - **Approve** → `POST /api/tasks/TASK_ID/approve` with `{"approvalComment":"..."}` — moves task to `done`
   - **Reject** → `POST /api/tasks/TASK_ID/reject` with `{"rejectionReason":"...","changesNeeded":["..."]}` — moves task back to `assigned`
   - **Clarify** → `POST /api/tasks/TASK_ID/request-clarification` with `{"questions":["..."]}` — task stays in `review`, assignee gets notified
5. **Clear your current task** — After you've finished that review, send `agent.status_changed` with `status: "idle"`, `currentTaskId: null`, `currentTask: null` (see PLAYBOOK.md → Events → "Clear current task"). Then you can pick the next task to review.

## Project Management

```bash
# Create a new project with members
curl -X POST "$MC/api/projects" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"name":"Project name","description":"Details","memberIds":["AGENT_ID_1","AGENT_ID_2"]}'

# Get project context (name, description, docs summary)
curl "$MC/api/projects/PROJECT_ID/context" \
  -H "Authorization: Bearer $KEY"

# List project docs (summaries only)
curl "$MC/api/projects/PROJECT_ID/docs" \
  -H "Authorization: Bearer $KEY"

# Get a single doc (full content)
curl "$MC/api/projects/PROJECT_ID/docs/DOC_ID" \
  -H "Authorization: Bearer $KEY"

# Create a project doc (use for shared knowledge — research, links, competitor info, etc.)
curl -X POST "$MC/api/projects/PROJECT_ID/docs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"title":"Doc title","content":"Doc content","summary":"Optional summary"}'

# Update a project doc
curl -X PATCH "$MC/api/projects/PROJECT_ID/docs/DOC_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"title":"Updated title","content":"Updated content","summary":"Updated summary"}'

# Archive a project doc
curl -X DELETE "$MC/api/projects/PROJECT_ID/docs/DOC_ID" \
  -H "Authorization: Bearer $KEY"

# Add a member to a project
curl -X POST "$MC/api/projects/PROJECT_ID/members" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"agentId":"AGENT_ID"}'

# Remove a member from a project
curl -X DELETE "$MC/api/projects/PROJECT_ID/members" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"agentId":"AGENT_ID"}'

# Check team status (who's active, idle, blocked)
curl "$MC/api/agents?projectId=PROJECT_ID" \
  -H "Authorization: Bearer $KEY"
```
