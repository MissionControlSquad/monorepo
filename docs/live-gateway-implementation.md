# Live Gateway — Implementation Plan (v2)

> Real-time bidirectional communication between Mission Control and **any** OpenClaw-powered machine — self-hosted, user-provisioned cloud, or MC-provisioned CloudVM. One plugin install. Agents receive tasks in seconds instead of waiting for the next heartbeat cycle.

**Branch:** `add/live-tasks-from-to-openclaw` → PR target: `main`
**Revised:** 2026-04-11

---

## Table of Contents

1. [Guiding Principle](#1-guiding-principle)
2. [What Exists and MUST NOT Change](#2-what-exists-and-must-not-change)
3. [Architecture](#3-architecture)
4. [Database — New Entities Only](#4-database--new-entities-only)
5. [Message Protocol](#5-message-protocol)
6. [Implementation Phases](#6-implementation-phases)
7. [Plugin Distribution](#7-plugin-distribution)
8. [Security](#8-security)
9. [Toggle & Plan Gating](#9-toggle--plan-gating)
10. [Testing](#10-testing)

---

## 1. Guiding Principle

**The live gateway is a purely additive layer.**

The existing system (heartbeat, tasks, agents, CloudVM, notifications, GraphQL subscriptions) is production-ready and continues working exactly as today. The live gateway adds a fast path on top. If a machine has the plugin installed and is connected, tasks arrive in sub-second. If not — or if the feature is toggled off — the existing heartbeat cycle handles everything as before. No degradation, no fallback needed in existing code.

**Rule:** Every file touched by this feature that already existed must be left functionally identical when the live gateway is disabled or absent.

---

## 2. What Exists and MUST NOT Change

### Existing working system (read-only for this feature)

| Area | Key files | Status |
|---|---|---|
| Task CRUD & assignment | `app/api/tasks/`, `src/server/models/task.ts` | Untouched |
| Agent model & heartbeat | `app/api/agents/me/heartbeat-preflight/`, `packages/database/src/agent*` | Untouched |
| CloudVM provisioning | `app/api/cloud-vms/`, `src/views/CloudPage.tsx`, `src/views/CloudVMDetailPage.tsx` | Untouched |
| CloudVM schema | `packages/database/prisma/schema/cloud-vm.prisma` | Untouched |
| Notification system | `src/server/events/handlers/notification.ts` | Untouched |
| GraphQL subscriptions | `packages/graphql-server/src/types/`, pubsub topics | Untouched |
| Existing WS path | `/api/graphql` → graphql-ws | Untouched |

### The ONE hook into existing code

The only place existing code gains awareness of the live layer is in task assignment:

```
PATCH /api/tasks/[id]  →  after existing assignees logic runs
  →  (new, fire-and-forget) liveTaskDelivery.tryDeliver(agentIds, taskOpts)
```

This call is wrapped so that any failure is swallowed — it never affects the task API response. If the live gateway is offline or toggled off, the function returns immediately with no side effects.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     EXISTING SYSTEM (unchanged)                      │
│  Agents ── heartbeat ── Tasks ── Notifications ── CloudVMs           │
└─────────────────────────┬───────────────────────────────────────────┘
                           │  additive — no existing code changes below
┌──────────────────────────▼──────────────────────────────────────────┐
│                      LIVE GATEWAY LAYER                              │
│                                                                       │
│  WS endpoint: /live-gateway  (new, in server.ts upgrade handler)     │
│                                                                       │
│  LiveConnectionRegistry (globalThis singleton, same pattern pubsub)  │
│    Map<connectionId → { ws, connectedAt, lastMessageAt, version }>   │
│                                                                       │
│  mc-bridge plugin connects FROM any machine → MC                     │
│    Self-hosted Mac/PC  ─────────────────────────────┐                │
│    User-provisioned VPS ──────────────────────────┐ │                │
│    MC-provisioned CloudVM ──────────────────────┐ │ │                │
│                                                 ↓ ↓ ↓                │
│                                         /live-gateway (WS)           │
│                                                 │                    │
│  LiveGatewayConnection  ←── created on first vm.hello               │
│  LiveAgentRoute         ←── agentSlug → connectionId mapping         │
│  LivePendingDelivery    ←── offline queue, drained on reconnect      │
│                                                                       │
│  Task assigned → tryDeliver(agentId)                                 │
│    → lookup LiveAgentRoute for agent username                        │
│    → connection live? → send mc.deliver_task via WS  (sub-second)   │
│    → connection offline? → queue in LivePendingDelivery              │
│    → no route at all? → heartbeat handles it (existing behaviour)    │
└─────────────────────────────────────────────────────────────────────┘
```

### Message flow (plugin → MC → agent)

```
Plugin boots on machine
  → vm.hello { token, fingerprint, nonce, timestamp, agents: [slugs], meta }
  ← mc.welcome { connectionId, connectionToken? }  (token only on first connect)

Every 30s:
  → vm.ping { timestamp }
  ← mc.pong { timestamp }

Agent roster / status deltas:
  → vm.agents_report { agents: [{ slug, status, ... }] }
  → vm.agent_status  { slug, status, ... }
  → vm.agent_message { slug, taskId, content, timestamp }
  → vm.task_done     { taskId }
  → vm.task_ack      { deliveryId }

MC → Plugin:
  ← mc.deliver_task { deliveryId, agentSlug, taskId, message, priority }
  ← mc.error        { code, message }
```

---

## 4. Database — New Entities Only

**Schema file:** `packages/database/prisma/schema/live-gateway.prisma`
**No changes to any existing `.prisma` file.**

```prisma
// ── Replay prevention ─────────────────────────────────────────────────────────

model UsedNonce {
  nonce  String   @id
  usedAt DateTime @default(now())

  @@index([usedAt])
  @@map("used_nonces")
}

// ── Install tokens (machine-agnostic, not VM-specific) ───────────────────────

model LiveGatewayToken {
  id          String    @id @default(cuid())
  tokenHash   String    @unique        // bcrypt hash, never stored plain
  tokenPrefix String    @db.VarChar(8) // first 8 chars, shown in UI
  name        String?                  // human label
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  revokedAt   DateTime?
  lastUsedAt  DateTime?

  @@index([isActive])
  @@map("live_gateway_tokens")
}

// ── Connected machines ────────────────────────────────────────────────────────

model LiveGatewayConnection {
  id                 String    @id @default(cuid())
  machineFingerprint String    @unique        // stable hash of hostname:mac, set on first connect
  connectionToken    String?                  // bcrypt hash of per-machine token, shown once
  machineName        String?   @db.VarChar(255)
  connectionStatus   String    @default("disconnected")  // connected | disconnected
  connectedAt        DateTime?
  lastDisconnectedAt DateTime?
  pluginVersion      String?
  hostMeta           Json?                    // { hostname, platform, arch, openclawVersion }
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  agentRoutes        LiveAgentRoute[]
  pendingDeliveries  LivePendingDelivery[]

  @@index([connectionStatus])
  @@map("live_gateway_connections")
}

// ── Agent slug → connection routing ──────────────────────────────────────────

model LiveAgentRoute {
  id           String               @id @default(cuid())
  connectionId String
  agentSlug    String               // Agent.username — how we route tasks
  createdAt    DateTime             @default(now())

  connection   LiveGatewayConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)

  @@unique([connectionId, agentSlug])
  @@index([agentSlug])              // hot path: task assignment → lookup by slug
  @@map("live_agent_routes")
}

// ── Offline delivery queue ────────────────────────────────────────────────────

model LivePendingDelivery {
  id             String               @id @default(cuid())
  connectionId   String
  agentSlug      String
  taskId         String
  message        String               @db.Text
  priority       String               @default("normal")
  idempotencyKey String               @unique         // task:{taskId}:agent:{agentSlug}
  createdAt      DateTime             @default(now())
  expiresAt      DateTime                             // 24h TTL
  delivered      Boolean              @default(false)
  deliveredAt    DateTime?

  connection     LiveGatewayConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)

  @@index([connectionId, delivered])
  @@index([expiresAt])
  @@map("live_pending_deliveries")
}
```

### Migration SQL

Single migration file: `packages/database/prisma/migrations/YYYYMMDD_add_live_gateway/migration.sql`
- Creates all 4 new tables
- No ALTER on any existing table

---

## 5. Message Protocol

Defined in `packages/types/src/live-gateway-protocol.ts`.

### Plugin → MC

| Type | Purpose |
|---|---|
| `vm.hello` | Auth handshake. Fields: `token`, `fingerprint`, `nonce` (32-char hex), `timestamp`, `pluginVersion`, `agents: string[]` (slugs), `meta` |
| `vm.ping` | Keepalive every 30s |
| `vm.agents_report` | Full agent roster with statuses |
| `vm.agent_status` | Single agent status delta |
| `vm.agent_message` | Agent sent a message (for AgentAction logging) |
| `vm.task_done` | Agent completed a task |
| `vm.task_ack` | Plugin confirms receipt of `mc.deliver_task` → marks LivePendingDelivery.delivered |

### MC → Plugin

| Type | Purpose |
|---|---|
| `mc.welcome` | Auth success. Fields: `connectionId`, `connectionToken?` (only on first connect) |
| `mc.pong` | Keepalive response |
| `mc.deliver_task` | Task push. Fields: `deliveryId`, `agentSlug`, `taskId`, `message`, `priority` |
| `mc.error` | Protocol error. Fields: `code` (`auth_failed` | `nonce_replay` | `internal_error`), `message` |

### LIVE_GATEWAY constants

```ts
MAX_CLOCK_SKEW_MS       = 30_000   // 30 seconds
HELLO_TIMEOUT_MS        = 10_000   // close if no hello within 10s
PLUGIN_PING_INTERVAL_MS = 30_000   // plugin pings every 30s
MC_EVICT_TIMEOUT_MS     = 90_000   // evict if no message for 90s
EVICTION_CHECK_MS       = 30_000   // eviction loop interval
TASK_DELIVERY_TTL_MS    = 86_400_000 // 24h pending queue TTL
PLUGIN_DEDUP_LIMIT      = 500      // max dedup set size in plugin
```

---

## 6. Implementation Phases

### Phase 0 — Revert first-pass mistakes (before adding anything)

Files to revert to pre-feature state:
- `packages/database/prisma/schema/cloud-vm.prisma` — remove vmToken, vmFingerprint, connectionStatus, connectedAt, lastDisconnectedAt, pluginVersion, hostMeta, PendingTaskDelivery model
- `packages/database/src/cloud-vm/list.ts` — remove `listCloudVMsWithLiveStatus`
- `packages/database/src/cloud-vm/index.ts` — remove live-gateway re-exports
- `packages/database/src/cloud-vm/update.ts` — revert `data as any` if only needed for removed fields
- `packages/graphql-server/src/types/cloud-vm.ts` — remove connectionStatus, connectedAt, lastDisconnectedAt, pluginVersion, vmFingerprint fields
- `apps/web/app/api/cloud-vms/route.ts` — revert to `listCloudVMs`
- `apps/web/src/views/CloudPage.tsx` — revert (no tabs, no token panel, no VMConnectionBadge)
- `apps/web/src/views/CloudVMDetailPage.tsx` — revert (no LiveGatewayStatus section)
- `apps/web/src/components/cloud/VMConnectionBadge.tsx` — delete
- `apps/web/src/components/cloud/VMTokenPanel.tsx` — delete (will be recreated in own section)
- Old migration: `20260411100000_add_vm_live_gateway_fields` — delete (CloudVM fields no longer added)
- Old migration: `20260411200000_add_used_nonce_and_install_token` — delete (will be merged into single new migration)

Files to rename / keep:
- `vm-live-registry.ts` → `live-connection-registry.ts` (keyed by connectionId, not vmId)
- `live-gateway-handler.ts` — rewrite (no CloudVM references)
- `live-task-delivery.ts` — rewrite (uses LiveAgentRoute, not cloudVmId)

### Phase 1 — Database

1. Create `packages/database/prisma/schema/live-gateway.prisma` (5 models above)
2. Create `packages/database/prisma/migrations/20260411300000_add_live_gateway/migration.sql`
3. Run `prisma generate` (dev only — tenants run `db:migrate:deploy`)
4. Create `packages/database/src/live-gateway/index.ts` with all DB helpers

DB helpers needed:
```ts
// Tokens
listActiveLiveGatewayTokens()
createLiveGatewayToken({ tokenHash, tokenPrefix, name? })
revokeLiveGatewayToken(id)
touchLiveGatewayToken(id)

// Nonces
consumeNonce(nonce: string): Promise<boolean>   // insert or false on conflict
deleteExpiredNonces()                           // used_at < now() - 1h

// Connections
findConnectionByFingerprint(fingerprint)
createConnection({ machineFingerprint, connectionToken, machineName, pluginVersion, hostMeta })
markConnectionConnected(id, pluginVersion, meta)
markConnectionDisconnected(id)

// Agent routes
upsertAgentRoutes(connectionId, slugs: string[])  // sync full list on hello
clearAgentRoutes(connectionId)
findConnectionByAgentSlug(slug)                    // hot path for task delivery

// Pending deliveries
enqueuePendingDelivery({ connectionId, agentSlug, taskId, message, priority, idempotencyKey, expiresAt })
drainPendingDeliveries(connectionId)               // returns undelivered, atomically marks in-flight
markDeliveryReceived(deliveryId)                   // called on vm.task_ack
deleteExpiredDeliveries()
```

### Phase 2 — Shared types

File: `packages/types/src/live-gateway-protocol.ts`
- All message types (plugin→MC, MC→plugin)
- `LIVE_GATEWAY` constants object
- Export from `packages/types/src/index.ts`

### Phase 3 — Connection registry

File: `apps/web/src/server/services/live-connection-registry.ts`
- `LiveConnectionRegistry` class
- Singleton on `globalThis` (same pattern as pubsub)
- Methods: `add`, `get`, `remove`, `has`, `touch`, `send`, `staleIds`, `size`, `allConnectionIds`
- Keyed by `connectionId` (not vmId)

### Phase 4 — WS handler

File: `apps/web/src/server/services/live-gateway-handler.ts`
- `handlePluginConnection(ws, req)`
- Auth via nonce + clock-skew + fingerprint lookup → `LiveGatewayConnection`
- On `vm.hello`: upsert connection, sync agent routes, drain pending, welcome
- All other message handlers updated to use connectionId / LiveAgentRoute
- No CloudVM references anywhere

WS server setup in `apps/web/server.ts`:
- New `WebSocketServer({ noServer: true })` listening on `/live-gateway`
- `startEvictionLoop()` called at startup

### Phase 5 — Task delivery

File: `apps/web/src/server/services/live-task-delivery.ts`
- `tryDeliverTaskToLiveAgents(agentIds: string[], opts)` — exported function
- For each agent: lookup `Agent.username` → `findConnectionByAgentSlug(username)`
- If connection found + live in registry → enqueue → send `mc.deliver_task`
- If offline → just enqueue (drained on reconnect)
- If no route at all → return silently (heartbeat handles it)
- Never throws — always fire-and-forget safe

Hook into task assignment (`apps/web/app/api/tasks/[id]/route.ts`):
```ts
// After existing emitAssigneesChanged — no changes to existing logic
tryDeliverTaskToLiveAgents(addedAgentIds, { taskId, taskTitle, ... }).catch(() => undefined);
```

### Phase 6 — API routes

Token management (install tokens):
- `GET  /api/live-gateway/tokens` — list masked tokens
- `POST /api/live-gateway/tokens` — generate token (raw shown once, bcrypt stored)
- `DELETE /api/live-gateway/tokens/[id]` — revoke

Connections (read-only, for UI):
- `GET /api/live-gateway/connections` — list machines with connection status + agent routes

Cleanup cron:
- `GET /api/cron/cleanup-live-gateway` — deletes expired nonces + deliveries (CRON_SECRET auth)
- Register in `vercel.json`: `{ "path": "/api/cron/cleanup-live-gateway", "schedule": "0 * * * *" }`

### Phase 7 — Plugin (`packages/mc-bridge-plugin/`)

OpenClaw plugin. No changes needed to existing OpenClaw or agent code.

Key plugin responsibilities:
1. On activate: connect WS to `mcUrl/live-gateway`
2. Send `vm.hello` with token + fingerprint + agent slugs from `openclaw.agents.list()`
3. Persist `connectionToken` after first welcome (config storage)
4. Send `vm.ping` every 30s
5. On `mc.deliver_task`: call `openclaw.agents.sendMessage(agentSlug, message)`, send `vm.task_ack`
6. On `vm.task_done`: agent completed task, notify MC
7. On `vm.agent_status` / `vm.agents_report`: forward OpenClaw events to MC
8. Reconnect with exponential backoff on disconnect

Plugin fingerprint: `sha256(hostname + ":" + primaryMacAddress)` — stable across reboots.

### Phase 8 — UI (own section, not in Cloud pages)

New page: `/live-gateway` (or Settings sub-section)

Components:
- `LiveGatewayPage` — lists connected machines, manage tokens
- `LiveConnectionCard` — machine name, status badge, agents on this connection, last seen
- `LiveGatewayTokenPanel` — create/revoke install tokens
- `LiveConnectionBadge` — "Live" / "Offline" pill (used in LiveGatewayPage only, not in CloudPage)

The Cloud pages (`/cloud`, `/cloud/[id]`) are **not modified**.

### Phase 9 — Toggle / plan gating

Add `liveGatewayEnabled: Boolean` to the account or plan model.

In `tryDeliverTaskToLiveAgents`: check flag first, return immediately if disabled.

UI toggle in Settings → Plan section. If disabled, existing heartbeat is the only path (no UI change elsewhere).

### Phase 10 — Tests

- Unit: `consumeNonce` idempotency, `buildTaskMessage` size caps, `findConnectionByAgentSlug`
- Integration: WS handshake → hello → deliver_task → task_ack round-trip
- Integration: offline queue drain on reconnect
- Integration: task assignment with no live connection (heartbeat path, existing tests must still pass)
- E2E: toggle off → no WS calls made

---

## 7. Plugin Distribution

Users install `mc-bridge` as a standard OpenClaw plugin:

**Option A — Zip download (primary)**
1. MC dashboard: Settings → Live Gateway → "Download Plugin"
2. Downloads `mc-bridge-plugin-vX.Y.Z.zip`
3. User drops zip into OpenClaw `plugins/` directory
4. OpenClaw loads on restart, shows config UI for `mcUrl` and `token`

**Option B — npm (for power users / CI)**
```bash
npm install -g @agentcenter/mc-bridge-plugin
openclaw plugin install mc-bridge
```

**Option C — Script (one-liner setup)**
```bash
curl -sSL https://{mc-domain}/api/live-gateway/install.sh | bash
```
Script downloads the correct version, installs into OpenClaw plugins dir, writes config.

Plugin config file (`mc-bridge.config.json`):
```json
{
  "mcUrl": "wss://your-mc.example.com",
  "token": "abc123def456...",
  "fingerprint": "(auto-generated on first boot, do not edit)"
}
```

After first successful `vm.hello`, MC issues a per-machine `connectionToken`. Plugin replaces the install token with this connection token in config — the install token can be revoked after onboarding.

---

## 8. Security

| Threat | Mitigation |
|---|---|
| Replay attack on `vm.hello` | 32-char hex nonce stored in `used_nonces`, atomic insert, rejected if seen |
| Clock manipulation | `MAX_CLOCK_SKEW_MS = 30s`, reject if delta > threshold |
| Token brute force | bcrypt(12), rate limiting on token endpoints (10 req/min) |
| Machine impersonation | After first connect: machineFingerprint bound to connectionToken (bcrypt hash). Reconnect verifies per-machine token, not install token |
| Oversized messages | Message total capped at 4096 bytes, title 200, description 1000, assignedBy 100 |
| XSS via agent content | `stripHtml()` on all agent message content before storage |
| Zombie connections | Eviction loop: terminate if no message in 90s |
| Nonce table growth | Cron job deletes nonces older than 1h |
| Delivery queue growth | 24h TTL on LivePendingDelivery, cron cleanup |

---

## 9. Toggle & Plan Gating

```
Account.liveGatewayEnabled (Boolean, default false)
  │
  ├── false → tryDeliverTaskToLiveAgents() returns immediately, no DB hit
  │           existing heartbeat path is the only path
  │
  └── true  → live delivery attempted first, heartbeat still works as fallback
```

Toggle location: Settings → Plan → "Live Task Delivery"
Plan enforcement: gated by subscription tier (Starter: off, Pro/Enterprise: on)

---

## 10. Testing

### What must not break (regression guard)
- All existing task API tests pass unchanged
- All existing agent heartbeat tests pass unchanged
- CloudVM provisioning tests pass unchanged
- `tryDeliverTaskToLiveAgents` failure never surfaces to task API caller

### New test coverage
- `consumeNonce`: second call with same nonce returns false
- `upsertAgentRoutes`: idempotent on repeated hello
- `drainPendingDeliveries`: returns only undelivered, marks in-flight atomically
- WS handshake: valid hello → welcome; invalid token → mc.error + close
- Clock skew: |delta| > 30s → auth_failed
- Nonce replay: second hello with same nonce → nonce_replay
- Task delivery: live connection → WS frame sent, PendingDelivery enqueued
- Task delivery: offline connection → only PendingDelivery enqueued
- Task delivery: no route → returns silently, no error
- Drain on reconnect: queued deliveries sent on next vm.hello
- Toggle: `liveGatewayEnabled = false` → zero DB queries, zero WS sends

---

## Status Tracker

| Phase | Description | Status |
|---|---|---|
| 0 | Revert first-pass CloudVM changes | pending |
| 1 | Database schema + migration + DB helpers | pending |
| 2 | Shared types package | pending |
| 3 | Live connection registry | pending |
| 4 | WS handler (live-gateway-handler.ts) | pending |
| 5 | Task delivery layer + hook in tasks route | pending |
| 6 | API routes (tokens, connections, cron) | pending |
| 7 | mc-bridge plugin | pending |
| 8 | UI — Live Gateway page (not Cloud pages) | pending |
| 9 | Toggle / plan gating | pending |
| 10 | Tests | pending |
