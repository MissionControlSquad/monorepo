# Live Gateway — Complete System Flow

> How Mission Control delivers tasks to agents: the existing heartbeat system, the new live gateway layer, and exactly what happens with and without a live connection.

---

## 1. The Two Worlds

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  WITHOUT Live Gateway (existing, always works)                               │
│                                                                               │
│  MC Dashboard ──PATCH /api/tasks/[id]──► Task DB                            │
│                                              │                               │
│                                         (agent polls)                        │
│                                              │                               │
│  OpenClaw Agent ◄──GET /heartbeat-preflight──┘  (every ~5s)                 │
│                                                                               │
│  Latency: up to 5 seconds (next heartbeat cycle)                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  WITH Live Gateway (additive fast path)                                      │
│                                                                               │
│  MC Dashboard ──PATCH /api/tasks/[id]──► Task DB                            │
│                      │                                                        │
│                      └──► tryDeliverTaskToLiveAgents() ──► WS frame         │
│                                                                ▼             │
│                                                       mc-bridge plugin       │
│                                                                ▼             │
│                                                       OpenClaw Agent         │
│                                                                               │
│  Latency: < 1 second (WebSocket push)                                        │
│  Fallback: heartbeat still runs — if WS fails, agent picks it up next poll  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Existing System (Heartbeat Path) — Unchanged

This is the baseline. Live gateway does NOT modify any of this.

```
┌──────────────┐          ┌─────────────────┐         ┌──────────────────┐
│  MC Dashboard│          │   MC Server      │         │  OpenClaw Machine│
│  (Next.js)   │          │  (Next.js API)   │         │  (any host)      │
└──────┬───────┘          └────────┬────────┘         └────────┬─────────┘
       │                           │                            │
       │  PATCH /api/tasks/[id]    │                            │
       │  { assigneeIds: [agentId]}│                            │
       │──────────────────────────►│                            │
       │                           │                            │
       │                    Update task in DB                   │
       │                    Emit assignees changed              │
       │                    (notifications, pubsub)             │
       │                           │                            │
       │◄──────────────────────────│                            │
       │  200 OK { task }          │                            │
       │                           │                            │
       │                           │   GET /api/agents/me/      │
       │                           │   heartbeat-preflight      │
       │                           │◄───────────────────────────│
       │                           │   (every ~5 seconds)       │
       │                           │                            │
       │                    Check for new tasks                 │
       │                    assigned to this agent              │
       │                           │                            │
       │                           │───────────────────────────►│
       │                           │  200 { tasks: [...] }      │
       │                           │                            │
       │                           │              Agent picks up task
       │                           │              starts working
```

**Key files (read-only, untouched by live gateway):**
- `app/api/agents/me/heartbeat-preflight/route.ts` — agent polling endpoint
- `packages/database/src/agent/` — agent DB helpers
- `packages/database/prisma/schema/cloud-vm.prisma` — CloudVM schema (no live gateway fields)
- `src/views/CloudPage.tsx` — Cloud UI (no live gateway UI)
- `src/views/CloudVMDetailPage.tsx` — VM detail (no live gateway UI)

---

## 3. Live Gateway Architecture

### Components

```
┌──────────────────────────────────────────────────────────────────────────┐
│  MC Server (Next.js + custom server.ts)                                   │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  Existing: /api/graphql (graphql-ws)                                 │ │
│  │  ─ Used by MC Dashboard for real-time subscriptions                  │ │
│  │  ─ NOT touched by live gateway                                        │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  NEW: /live-gateway (WebSocketServer, noServer: true)                │ │
│  │  ─ Accepts connections from mc-bridge plugin                          │ │
│  │  ─ Handles: vm.hello, vm.ping, vm.agents_report, vm.task_ack, etc.  │ │
│  │  ─ live-gateway-handler.ts → handlePluginConnection()               │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  LiveConnectionRegistry (globalThis singleton)                       │ │
│  │  Map<connectionId → { ws, connectedAt, lastMessageAt, version }>    │ │
│  │  ─ Same globalThis pattern as pubsub                                 │ │
│  │  ─ Shared between WS handler and task delivery service               │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘

Database (PostgreSQL via Prisma):
  ┌─ used_nonces            ← replay attack prevention
  ├─ live_gateway_tokens    ← install tokens (bcrypt hashed)
  ├─ live_gateway_connections ← one row per machine
  ├─ live_agent_routes      ← agentSlug → connectionId mapping (hot path)
  └─ live_pending_deliveries ← offline queue (24h TTL)
```

### Machine Types — All Connect the Same Way

```
Self-hosted Mac/PC
User-provisioned VPS          ──► mc-bridge plugin ──► wss://mc.example.com/live-gateway
MC-provisioned CloudVM

There is NO special handling per machine type.
The plugin works identically regardless of where it runs.
```

---

## 4. Plugin Authentication Flow (First Connect)

```
mc-bridge plugin boots on machine
         │
         │  Reads mc-bridge.config.json:
         │  { mcUrl: "wss://...", token: "<install-token>" }
         │
         ▼
Generate machineFingerprint = sha256(hostname + ":" + primaryMacAddress)
Generate nonce              = 32 random hex chars (one-time use)
         │
         ▼
Open WebSocket to wss://mc.example.com/live-gateway
         │
         │──── vm.hello ────────────────────────────────────────────────────►│
         │     {                                                              │
         │       type: "vm.hello",                                           │ MC Server
         │       token: "<install-token>",    ← bcrypt-compared on server   │
         │       fingerprint: "<sha256>",     ← unique per machine           │
         │       nonce: "<32-hex>",           ← atomic insert, blocks replay │
         │       timestamp: 1712345678000,    ← within 30s of server time    │
         │       pluginVersion: "1.0.0",                                     │
         │       agents: ["agent-slug-1", "agent-slug-2"],                   │
         │       meta: { hostname, platform, arch, openclawVersion }         │
         │     }                                                              │
         │                                                                    │
         │                         Server checks:                            │
         │                         1. |now - timestamp| < 30s  (clock skew) │
         │                         2. nonce INSERT → reject if duplicate     │
         │                         3. fingerprint not in DB → first connect  │
         │                         4. bcrypt.compare(token, tokenHash)       │
         │                         5. Generate per-machine connectionToken   │
         │                         6. Create LiveGatewayConnection row       │
         │                         7. Sync LiveAgentRoute rows               │
         │                         8. Drain LivePendingDelivery queue        │
         │                                                                    │
         │◄─── mc.welcome ───────────────────────────────────────────────────│
         │     {                                                              │
         │       type: "mc.welcome",                                         │
         │       vmId: "clx...",          ← connectionId (save this)        │
         │       vmToken: "abc123..."     ← per-machine token (shown ONCE)  │
         │     }                                                              │
         │                                                                    │
Plugin saves connectionToken to mc-bridge.config.json
Install token can now be revoked from the MC dashboard
```

---

## 5. Plugin Reconnect Flow (Subsequent Connects)

```
Plugin reconnects (after restart / network drop)
         │
         │  Reads mc-bridge.config.json:
         │  { mcUrl: "...", token: "<connection-token>" }  ← machine-specific now
         │
         ▼
Generate fresh nonce + timestamp
         │
         │──── vm.hello ────────────────────────────────────────────────────►│
         │     { token: "<connection-token>",  ← bcrypt vs stored hash      │
         │       fingerprint: "<same sha256>", ← already in DB              │
         │       nonce: "<new 32-hex>",                                      │
         │       ... }                                                        │
         │                                                                    │
         │                         Server checks:                            │
         │                         1. Clock skew OK                          │
         │                         2. Nonce not seen before                  │
         │                         3. Fingerprint EXISTS in DB               │
         │                         4. bcrypt.compare(token, connectionToken) │
         │                         5. markConnectionConnected()              │
         │                         6. syncAgentRoutes()                      │
         │                         7. drainPendingDeliveries() → send queued │
         │                                                                    │
         │◄─── mc.welcome ────────────────────────────────────────────────── │
         │     { vmId: "clx...", vmToken: undefined }  ← no new token       │
         │                                                                    │
         │◄─── mc.deliver_task (×N) ─────────────────────────────────────── │
         │     Tasks queued while plugin was offline sent immediately        │
```

---

## 6. Ongoing Keepalive

```
Every 30 seconds:

Plugin ──── vm.ping { timestamp } ────────────────────────────────────────► MC
       ◄─── mc.pong { timestamp } ─────────────────────────────────────────

MC eviction loop (every 30s):
  - Find connections where lastMessageAt < now - 90s
  - ws.terminate() → triggers "close" → cleans up DB + registry
```

---

## 7. Task Assignment — With Live Connection

```
MC Dashboard
     │
     │  PATCH /api/tasks/[id]  { assigneeIds: ["agent-abc"] }
     ▼
app/api/tasks/[id]/route.ts
     │
     ├─ taskModel.update()                     ← save task changes to DB
     ├─ diffTaskAssignees()                    ← update assignee records
     ├─ taskModel.emitAssigneesChanged()       ← notifications, pubsub (existing)
     │
     └─ tryDeliverTaskToLiveAgents(            ← NEW, fire-and-forget
          ["agent-abc"],
          { taskId, taskTitle, priority, assignedBy }
        ).catch(() => undefined)              ← errors NEVER surface to caller
     │
     ▼  200 OK returned to Dashboard immediately (not waiting for WS)

tryDeliverTaskToLiveAgents():
     │
     ├─ agentIds.length === 0 → return immediately
     │
     ├─ prisma.agent.findMany({ where: { id: { in: agentIds } } })
     │  → get agent.username (this is the slug the plugin knows)
     │
     ├─ For each agent:
     │   │
     │   ├─ findConnectionByAgentSlug(slug)
     │   │   → SELECT on live_agent_routes WHERE agentSlug = slug
     │   │   → JOIN live_gateway_connections to get connectionId
     │   │
     │   ├─ No route found → SKIP (heartbeat handles it, no error)
     │   │
     │   ├─ Route found:
     │   │   │
     │   │   ├─ enqueuePendingDelivery()
     │   │   │   → INSERT into live_pending_deliveries
     │   │   │   → idempotencyKey = "task:{taskId}:agent:{slug}"
     │   │   │   → if key already exists → skip (already queued)
     │   │   │   → expiresAt = now + 24h
     │   │   │
     │   │   └─ connectionRegistry.send(connectionId, mc.deliver_task)
     │   │       → get WS from in-memory registry
     │   │       → ws.readyState === 1 (OPEN)?
     │   │           YES → ws.send(JSON.stringify(msg)) → task delivered!
     │   │           NO  → delivery stays queued, drained on reconnect

mc-bridge plugin receives mc.deliver_task:
     │
     ├─ { deliveryId, agentSlug, taskId, message, priority }
     │
     ├─ openclaw.agents.sendMessage(agentSlug, message)
     │   → agent receives the task instruction
     │
     └─ Send vm.task_ack { deliveryId }
         → MC marks LivePendingDelivery.delivered = true
         → delivery removed from queue
```

---

## 8. Task Assignment — Without Live Connection

```
MC Dashboard
     │
     │  PATCH /api/tasks/[id]  { assigneeIds: ["agent-abc"] }
     ▼
app/api/tasks/[id]/route.ts
     │
     ├─ taskModel.update()                    ← save task changes (same as always)
     ├─ diffTaskAssignees()
     ├─ taskModel.emitAssigneesChanged()      ← notifications fired (same as always)
     │
     └─ tryDeliverTaskToLiveAgents(...)
          │
          ├─ prisma.agent.findMany() → gets agent username
          │
          └─ findConnectionByAgentSlug(slug)
              → No row in live_agent_routes for this slug
              → return (silently, no error, no log)
     │
     ▼  200 OK

OpenClaw Agent (polling as always):
     │
     │  GET /api/agents/me/heartbeat-preflight  (next ~5 second poll)
     │
     ▼  { tasks: [{ id: "...", title: "..." }] }  ← picks up the task normally
```

**Zero degradation. The heartbeat path is completely unaffected.**

---

## 9. Agent Status Updates (Live → MC)

```
OpenClaw agent starts working on a task
         │
         ▼
mc-bridge plugin detects status change
         │
         │──── vm.agent_status ─────────────────────────────────────────────►│
         │     { slug: "agent-1", status: "busy",                            │
         │       detailedStatus: "running",                                   │
         │       currentTaskId: "task-abc" }                                  │
         │                                                                    │
         │                    prisma.agent.update({ status, detailedStatus })│
         │                    pubsub.publish(AGENT.STATUS_CHANGED)            │
         │                    → Dashboard receives real-time status update    │

Agent sends a message:
         │──── vm.agent_message ────────────────────────────────────────────►│
         │     { slug: "agent-1", taskId: "task-abc",                        │
         │       content: "Running analysis...", timestamp }                  │
         │                                                                    │
         │                    stripHtml(content)  ← XSS prevention          │
         │                    prisma.agentAction.create()                     │
         │                    pubsub.publish(AGENT.ACTION_LOGGED)             │

Agent completes a task:
         │──── vm.task_done ────────────────────────────────────────────────►│
         │     { taskId: "task-abc" }                                         │
         │                                                                    │
         │                    prisma.task.updateMany({ status: "done" })     │
         │                    pubsub.publish(TASK.UPDATED)                    │
```

---

## 10. Offline Queue (Agent Assigned While Plugin Disconnected)

```
Timeline:

T=0    Plugin disconnects (network drop, machine restart)
       MC detects close → registry.remove(id) + markConnectionDisconnected()
       LiveAgentRoute rows cleared for this connection

T=30   Task assigned to "agent-slug-1"
       tryDeliverTaskToLiveAgents():
         findConnectionByAgentSlug("agent-slug-1") → no route (routes cleared)
         → silently return, heartbeat handles it
         
       Wait — if agent is currently offline (machine down), heartbeat also fails.
       The task sits in the DB waiting for the agent to come back online.

T=300  Plugin reconnects, sends vm.hello with agents: ["agent-slug-1"]
       syncAgentRoutes() → inserts route for "agent-slug-1"
       drainPendingDeliveries():
         SELECT * FROM live_pending_deliveries
         WHERE connectionId = ? AND delivered = false AND expiresAt > now()
         → sends mc.deliver_task for each pending task
       
       Plugin receives tasks, agent picks up work immediately.
```

> **Note:** The pending queue is for tasks assigned *while connected* but before the ack arrives (brief disconnect). For machines that were offline when the task was assigned, the heartbeat is the pickup path. The drain catches any tasks that were WS-delivered but not ack'd before disconnect.

---

## 11. Feature Flag Gating

```
FLAG_KEYS.LIVE_GATEWAY = "live_gateway"
Default: false (system-managed, off until plan enables it)

Plan tier check:
  └─ FeatureGate component wraps /live-gateway page and layout
  └─ If flag off → user sees "upgrade to access Live Gateway" screen

Effect of flag = false on task delivery:
  tryDeliverTaskToLiveAgents() is called regardless (it's just a function call).
  But findConnectionByAgentSlug() returns null for everyone
  because no machines have live connections (flag was off, no one installed plugin).
  → Silently no-ops. Heartbeat handles all tasks.

Effect of flag = true:
  /live-gateway page is accessible.
  User can generate install tokens, install mc-bridge plugin.
  Plugin connects → routes registered → fast delivery kicks in.
```

---

## 12. Security Layers

```
Attack                   Mitigation
─────────────────────────────────────────────────────────────────────────────
Replay vm.hello          Nonce: atomic INSERT into used_nonces.
                         If nonce already exists → P2002 → consumeNonce() = false
                         → sendError(auth_failed) + terminate()

Clock manipulation       |timestamp - Date.now()| > 30,000ms → auth_failed
                         Prevents token use from a recorded packet

Token brute force        bcrypt(cost=12) for all token storage.
                         Rate limit: 10 req/min on token endpoints.
                         Separate install token vs per-machine token.

Machine impersonation    After first connect: machineFingerprint bound to
                         connectionToken (bcrypt hash). Attacker needs both
                         the fingerprint AND the raw connectionToken.

XSS via agent content    stripHtml() on all vm.agent_message content
                         before storing in agentAction.description

Oversized messages       Title: 200 chars. Description: 1000 chars.
                         AssignedBy: 100 chars. Total: 4096 bytes.
                         hostMeta JSON: 4096 bytes (trimmed if larger)

Zombie connections       Eviction loop every 30s: terminate connections
                         with lastMessageAt > 90s ago

Nonce table growth       Cron: DELETE FROM used_nonces WHERE usedAt < now()-1h
                         Runs hourly via /api/cron/cleanup-live-gateway

Delivery queue growth    24h TTL on live_pending_deliveries
                         Cron cleans expired rows hourly
```

---

## 13. Full Database Entity Map

```
Existing (untouched):          New (live gateway only):
                                
Agent                          UsedNonce
  id                             nonce  @id
  username  ◄──────────────────  (used as agentSlug lookup key)
  name                           usedAt
  status                       
  ...                          LiveGatewayToken
                                 id
Task                             tokenHash   (bcrypt, never plain)
  id                             tokenPrefix (first 8 chars, shown in UI)
  title                          name        (human label)
  description                    isActive
  status                         createdAt / revokedAt / lastUsedAt
  ...                          
                               LiveGatewayConnection
AgentProfile                     id
  id                             machineFingerprint @unique
  agentId                        connectionToken (bcrypt hash)
  ...                            machineName
                                 connectionStatus (connected|disconnected)
CloudVM (untouched)              connectedAt / lastDisconnectedAt
  id                             pluginVersion
  name                           hostMeta (JSON)
  status                         createdAt / updatedAt
  ipv4                         
  region                       LiveAgentRoute
  ...                            id
  (NO live gateway fields)       connectionId → LiveGatewayConnection
                                 agentSlug           (Agent.username)
                                 @@unique([connectionId, agentSlug])
                                 @@index([agentSlug])  ← task delivery hot path

                               LivePendingDelivery
                                 id
                                 connectionId → LiveGatewayConnection
                                 agentSlug
                                 taskId
                                 message  @db.Text
                                 priority
                                 idempotencyKey @unique
                                 createdAt / expiresAt (24h TTL)
                                 delivered / deliveredAt
```

---

## 14. With vs Without — Side-by-Side

```
                         WITHOUT Live Connection    WITH Live Connection
─────────────────────────────────────────────────────────────────────────────
Plugin installed?        No                         Yes (mc-bridge on machine)

Task delivery latency    ~5 seconds (next heartbeat) < 1 second (WS push)

Agent picks up task via  GET /heartbeat-preflight   mc.deliver_task WS frame

Task queued when         Never (task sits in DB,    Yes — LivePendingDelivery
agent offline?           agent polls when back)     (drained on reconnect)

Agent status updates     Agent pushes via heartbeat  Plugin pushes vm.agent_status
reach MC via             response body               in real time

Task completion          Agent PATCH /api/tasks/[id] vm.task_done → MC marks done
reported via             { status: "done" }          instantly

/live-gateway page       "No machines connected"     Lists machines + status

Existing system          Works exactly as designed   Still works (double path)
affected?                                            Heartbeat is always the
                                                     fallback — nothing breaks
```

---

## 15. File Map

```
New files (live gateway):
  packages/database/prisma/schema/live-gateway.prisma
  packages/database/src/live-gateway/index.ts
  packages/types/src/live-gateway-protocol.ts
  packages/mc-bridge-plugin/src/ws-client.ts
  apps/web/src/server/services/live-connection-registry.ts
  apps/web/src/server/services/live-gateway-handler.ts
  apps/web/src/server/services/live-task-delivery.ts
  apps/web/app/api/live-gateway/tokens/route.ts
  apps/web/app/api/live-gateway/tokens/[id]/route.ts
  apps/web/app/api/live-gateway/connections/route.ts
  apps/web/app/api/cron/cleanup-live-gateway/route.ts
  apps/web/app/(dashboard)/live-gateway/page.tsx
  apps/web/app/(dashboard)/live-gateway/layout.tsx
  apps/web/src/views/LiveGatewayPage.tsx
  apps/web/src/components/layout/sidebar/panels/LiveGatewayPanel.tsx

Modified files (minimal, additive only):
  apps/web/server.ts                       ← +WS upgrade handler for /live-gateway
  apps/web/app/api/tasks/[id]/route.ts     ← +tryDeliverTaskToLiveAgents() call
  apps/web/src/components/layout/sidebar/IconRail.tsx  ← +Live Gateway nav item
  packages/utils/src/feature-flag-keys.ts  ← +LIVE_GATEWAY flag
  packages/database/src/index.ts           ← +live-gateway exports
  packages/types/src/index.ts              ← +live-gateway-protocol exports
  vercel.json                              ← +cron schedule

Untouched (read-only):
  packages/database/prisma/schema/cloud-vm.prisma  (no new fields)
  apps/web/src/views/CloudPage.tsx                 (no tabs, no tokens)
  apps/web/src/views/CloudVMDetailPage.tsx         (no live badge)
  app/api/agents/me/heartbeat-preflight/           (heartbeat unchanged)
  All existing GraphQL subscriptions               (pubsub topics unchanged)
```
