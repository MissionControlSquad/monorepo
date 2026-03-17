# Mission Control - Progress & Development Roadmap

> Last updated: 2026-02-12

---

## System Overview

**Mission Control** is a real-time multi-agent AI team coordination dashboard built with Next.js App Router + PostgreSQL + GraphQL. It manages AI agent squads (Kia, Nova, Aria, Sage, Lux, Rex) through a Kanban-style interface with live monitoring, task lifecycle management, and collaboration features.

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js App Router + React 19 + TypeScript |
| Styling | Tailwind CSS + Headless UI |
| Backend | PostgreSQL (Neon) + Prisma ORM |
| API | GraphQL (Pothos + Yoga) + REST endpoints |
| Real-time | GraphQL subscriptions via SSE (graphql-sse) |
| Storage | Cloudflare R2 (presigned URLs) |
| Markdown | marked + DOMPurify |
| Icons | Lucide React |

---

## Completed Features

### Backend — PostgreSQL + Prisma + GraphQL + REST API

- [x] Agent identity sync, wake/sleep, heartbeat, auto-sleep stale agents (cron)
- [x] Task CRUD with auto-incrementing task numbers
- [x] Task templates — library and create-from-template
- [x] Parent-child task hierarchy with parent context queries
- [x] Task dependencies — blockedByTaskId with full UI
- [x] Task review workflow — approve (with child task creation), reject (with feedback), request clarification
- [x] Deliverables system — markdown, code, file uploads (Cloudflare R2), links; version history per deliverable
- [x] Comments with markdown and `@mention` parsing
- [x] Notification system — @mention alerts, task subscription auto-follow, mark read
- [x] Activity feed — 10+ event types, agent/task filtering, access-controlled
- [x] Agent personal queue — todo lists, priority, auto-generated action items on rejection
- [x] Live agent actions — real-time logging (file_edited, code_written, etc.) with auto-status inference
- [x] Work session tracking — time per agent per task with duration calculation
- [x] Status history — full audit trail of agent status transitions
- [x] Event bus architecture — 17 event types, 9 handler modules
- [x] Role-based access control — lead/specialist/intern levels
- [x] Admin authentication — AdminUser model, /api/auth/setup and /api/auth/login, session cookie (mc_session); middleware protects dashboard routes
- [x] REST API — 19 endpoints for agent access (replaces CLI commands)
- [x] GraphQL subscriptions — 5 subscription types via SSE for real-time frontend updates
- [x] PubSub event publishing — agent status, task updates, activities, notifications, messages

### Frontend (Next.js App Router) — 36+ Components

- [x] Auth pages — login and setup (first-time admin account creation); redirect to login when unauthenticated
- [x] 3-column dashboard layout — squad sidebar, kanban center, activity feed right
- [x] Kanban board — column view + row view, drag-and-drop task movement
- [x] Filter bar — search (debounced), priority chips, assignee avatars, tag filters
- [x] Task cards — priority, assignees, tags, due date, parent indicator, work indicator
- [x] Task detail modal — full editing, deliverables, comments, child tasks, work summary, blocked-by, reactions
- [x] Create task modal — title, description (markdown), priority, assignees, due date, tags; create from template
- [x] Squad status cards — online/offline, detailed status badges, quick actions
- [x] Live agent view — real-time action stream with auto-scroll, paginated
- [x] Agent queue dialog — personal queue management
- [x] Agent detail dialog — status history timeline
- [x] Notification bell — dropdown with count, mark all read
- [x] Activity feed — agent/task filters, markdown preview, copy button, infinite scroll
- [x] Global search — Cmd+K across tasks, messages, deliverables (GlobalSearch)
- [x] Analytics page — 6 charts (workload, cycle time, completion trend, activity trend, review metrics, task status)
- [x] Message reactions — emoji reactions on comments with real-time updates
- [x] Markdown editor — toolbar, @mention dropdown with keyboard nav
- [x] UI primitives — Button (4 variants), Badge (8 colors), Input, StatusPill, PrioritySelect
- [x] Context providers — AppContext (selectedAgentId, currentAgent, projectId, mode), AgentStatus (online with 15s refresh)
- [x] Loading/empty states — skeletons, contextual messages
- [x] Error boundaries — root + panel-level (AppShell, Kanban); FullPageErrorFallback and PanelErrorFallback with retry
- [x] Real-time subscriptions — 6 components wired to GraphQL subscriptions via SSE

### Agent Setup

- [x] 6 agent definitions — Kia (Squad Lead), Nova (Research), Aria (Writer), Sage (Social), Lux (Design), Rex (Frontend)
- [x] Per-agent config — identity, soul/personality, tools, heartbeat
- [x] Shared playbook — operating manual for all agents (REST API commands)

---

## Pending — Development Roadmap

### P0 — Critical / Foundation

- [x] **Routing & URL support** — Next.js App Router with `/task/:taskId` deep-linking
- [x] **Human user authentication** — Admin login/setup (username + password, session cookie); dashboard protected by middleware. Agent API uses Bearer API key. Optional future: OAuth, email/password for multiple users
- [x] **Error boundaries** — ErrorBoundary at root (FullPageErrorFallback) + panel-level in AppShell, KanbanPage; retry support
- [x] **Toast notifications** — Sonner library with success/error toasts across 9+ components
- [x] **Testing foundation** — E2E (full-flow) + unit (api-key, cache, event-bus, rate-limit, sanitize, middleware, notification handler) + GraphQL agents integration test; CI (GitHub Actions) runs unit-no-db and full suite with Postgres
- [ ] **Mobile responsive layout** — Some responsive classes (sm/md/lg) present; 3-column layout still breaks on small screens

### P1 — High Priority

#### Task Management
- [x] Task templates — template library + instantiation from CreateTaskModal (Research, Content Writing, etc.)
- [ ] Bulk task operations — multi-select → change status, assign, delete
- [x] Task dependencies — blockedByTaskId + full UI (dependency arrows, blocked indicators in TaskDetailModal)
- [ ] Recurring tasks — scheduled/repeating (daily standups, weekly reports)
- [ ] Due date reminders — notifications for approaching/overdue deadlines
- [x] Full-text task search — Cmd+K global search across tasks, messages, deliverables (GlobalSearch)
- [ ] Urgent priority level — backend queue supports it but task schema only has low/medium/high
- [x] Pagination / infinite scroll — cursor-based pagination on all major data feeds

#### Agent Management
- [ ] Agent creation/editing UI — new agents require API/CLI; dashboard can edit existing (AgentDetailDialog)
- [ ] Agent performance metrics — tasks completed, avg time, rejection rate
- [ ] Agent workload balancing — visual load indicator, smart assignment suggestions
- [x] Agent configuration UI — edit name, role, emoji, personality from Agent detail dialog (picked up on next heartbeat)

### P2 — Medium Priority

#### Collaboration
- [ ] Threaded comments — reply to specific comments (currently flat list)
- [ ] Comment editing/deletion — comments are currently immutable
- [ ] File attachments in comments — currently only in deliverables
- [ ] Real-time typing indicators — show when agent is composing
- [x] Comment reactions — emoji reactions on messages (MessageReactions; thumbs-up, heart, eyes, etc.)
- [ ] @mention autocomplete in all inputs — currently only in MarkdownEditor

#### Deliverables & Documents
- [ ] Code syntax highlighting — code deliverables lack highlighting in preview
- [x] Deliverable versioning — version history for deliverables (DeliverableVersion model; diff viewer not yet built)
- [ ] Deliverable review/approval — approve individual deliverables, not just tasks
- [ ] Document organization — folders, tags, categories for knowledge base
- [ ] Document collaboration — real-time co-editing

#### UX & Polish
- [ ] Dark mode — no theme toggle, everything is light
- [ ] Keyboard shortcuts — no hotkeys for common actions
- [ ] Drag-and-drop improvements — card preview during drag, multi-card drag
- [ ] Undo/redo — no undo for status changes or deletions
- [ ] Onboarding tour — no first-time user guidance
- [ ] Settings page — no user preferences

### P3 — Nice to Have

#### Analytics & Reporting
- [x] Dashboard analytics page — Analytics page with 6 charts (workload, cycle time, completion trend, activity trend, review metrics, task status)
- [ ] Sprint/cycle reports — completed work summaries over time periods
- [ ] Burndown/burnup charts — visual progress tracking
- [ ] Agent activity heatmap — when agents are most active
- [ ] Time tracking reports — exportable work session summaries

#### Integrations
- [ ] GitHub integration — link tasks to PRs/issues, show CI status
- [ ] Slack/Discord notifications — push to external channels
- [ ] Webhook support — external systems subscribe to events
- [ ] API documentation — OpenAPI/Swagger for REST API
- [ ] Import/Export — export tasks, reports, data

#### Infrastructure & DevOps
- [ ] CI/CD pipeline — automated build/deploy
- [ ] Environment management — staging/production separation
- [ ] Rate limiting — no rate limiting on API endpoints
- [ ] Application-level input validation — relies solely on Prisma validators
- [ ] Error tracking — Sentry or similar
- [ ] Performance monitoring — bundle analysis, Lighthouse CI
- [ ] Backup strategy — beyond Neon cloud defaults
- [ ] Accessibility audit — keyboard nav, screen reader, color contrast

---

## Verified checklist (2026-02-12)

| Item | Status | Notes |
|------|--------|--------|
| Error boundaries | ✅ Done | Root + AppShell + Kanban; was listed P0 pending |
| Testing | Done | E2E + unit (api-key, cache, event-bus, rate-limit, sanitize, middleware, notification-handler) + GraphQL agents; CI workflow runs on push/PR |
| Mobile responsive | Partial | Tailwind sm/md/lg used; 3-col still needs work |
| Task Priority enum | low/medium/high only | QueueItemPriority has `urgent`; Task does not |

### Test files checked

| File | What it covers |
|------|----------------|
| **tests/setup.ts** | Global beforeAll: `prisma db push`, truncate all tables. afterAll: truncate + disconnect. No per-test DB reset (e2e shares state). |
| **tests/helpers.ts** | `adminSetup`, `adminLogin`, `adminLogout`, `extractSessionCookie`, `createTestAgent` (with API key), `createTestTask`, `createTestProject`, `buildRequest` (Bearer apiKey), `callRoute`. Uses API key auth only (no sessionKey). |
| **tests/e2e/full-flow.test.ts** | ~170+ `it()` cases in 14 sections: (1) First-time setup, (2) Auth & brute-force rate limit, (3) Agent create/me/list/401/403, (4) Task CRUD, assign, activity, (5) Messages, @mentions, @all, XSS escape, (6) Deliverables all kinds + versioning, (6½) R2 upload/download, (9) Projects & members, (10) Review cycle approve/reject/clarify, (11) Message reactions, (12) Notifications, (13) Agent queue, (14) Board, (14½) Batch task creation. Calls route handlers directly (no browser). |
| **tests/unit/api-key.test.ts** | `generateApiKey` (mc_ prefix, hash, unique), `hashApiKey` (consistent, 64-char hex). |
| **tests/unit/cache.test.ts** | TTLCache: get/set, expiry, delete, clear, invalidatePrefix. |
| **tests/unit/event-bus.test.ts** | `on`/`emit`: handler called for matching type, not for other, multiple handlers order, no handlers no error. |
| **tests/unit/rate-limit.test.ts** | createRateLimiter: under limit allowed, over limit blocked + retryAfterSec, per-key, reset after window. |
| **tests/unit/sanitize.test.ts** | `escapeHtml` (XSS, ampersand, quotes), `parseChildTasks` (array/JSON, trim, assigneeIds filter). |
| **tests/unit/middleware.test.ts** | `requiresAdminAuth(pathname)`: auth/static paths false; dashboard + GraphQL/agents/create/templates true. |
| **tests/unit/notification-handler.test.ts** | TASK_CREATED/MESSAGE_CREATED handlers: mocked models + pubsub; assert create/publish calls. |
| **tests/unit/graphql-agents.test.ts** | Integration: create agent via helpers, run `agents` and `agent(id)` queries, assert shape. |
| **.github/workflows/test.yaml** | Unit (no DB) job + Test (Postgres service) job on push/PR to main. |

**Gaps addressed:** GraphQL resolvers (agents query integration test), auth middleware (requiresAdminAuth unit tests), notification handlers (unit tests with mocks), CI (GitHub Actions test workflow). E2E still depends on real DB; no mocked API layer.

---

## Next to develop (recommended order)

**1. P0 — Mobile responsive layout**  
3-column dashboard breaks on small screens. Add a single-column/stacked layout for narrow viewports (e.g. sidebar as drawer, activity as bottom sheet or tab). High impact for daily use.

**2. P1 — Bulk task operations**  
Multi-select on Kanban → change status, assignees, or delete. Common workflow; unblocks power users.

**3. P1 — Agent creation from dashboard**  
"Add Agent" flow (name, role, API key generation, optional workspace) so new agents don’t require CLI/files. Aligns with COMPETITIVE-ANALYSIS gap #1.

**4. P2 — Dark mode**  
Theme toggle + dark Tailwind theme. Low effort, high polish; frequently requested.

**5. P0/P3 — Testing & CI**  
Expand unit tests (GraphQL resolvers, auth, key mutations) and run E2E + unit in CI (e.g. GitHub Actions). Prevents regressions before adding more features.

*After that:* Due date reminders (P1), webhooks (P3 integrations), deliverable diff viewer (P2), urgent priority for tasks (P1, schema + UI).

---

## Architecture Notes

### Backend Structure
```
prisma/
├── schema.prisma          # Database schema with indexes

app/api/
├── _lib/                  # Shared utilities (resolve-agent, json-response)
├── graphql/route.ts       # GraphQL endpoint (Pothos + Yoga)
├── events/ingest/route.ts # Event ingestion endpoint
├── agents/                # Agent REST endpoints
├── tasks/                 # Task REST endpoints (CRUD + reviews)
├── messages/              # Comment REST endpoints
├── deliverables/          # Deliverable REST endpoints (nested under tasks)
├── notifications/         # Notification REST endpoints
├── queue/                 # Agent queue REST endpoints
├── projects/              # Project REST endpoints
└── storage/               # Cloudflare R2 file endpoints

src/server/
├── prisma.ts              # Prisma client (via models)
├── graphql/               # GraphQL schema (Pothos)
├── events/                # Event bus + handlers
├── pubsub/                # PubSub for subscriptions
└── models/                # Prisma models + R2 utilities
```

### Frontend Structure (`src/`)
```
src/
├── views/                 # Page-level components
├── components/
│   ├── agent/             # 5 components — status, live view, queue, detail, timeline
│   ├── common/            # 7 components — markdown, mentions, copy, time
│   ├── context/           # AppContext (agent + project + mode), AgentStatus
│   ├── kanban/            # 5 components — board, column, row, card, filter
│   ├── layout/            # 4 components — header, squad cards, feed, notifications
│   ├── task/              # 6 components — detail modal, create, comments, deliverables
│   └── ui/                # 7 primitives — button, badge, input, status, priority
└── lib/constants.ts       # Statuses, colors, agent levels
```

### Event Flow
```
Agent Action → REST API / Event Ingest → Event Bus → Handlers → Activity/Notification/State
                                                                    ↓
                                                         PubSub → SSE → GraphQL Subscription → UI Update
```

### Key Domain Concepts
- **Agent Levels**: intern (needs approval) → specialist (independent) → lead (full autonomy)
- **Task Statuses**: inbox → assigned → in_progress → review → done | blocked
- **Detailed Agent Statuses**: thinking, coding, reviewing, researching, deploying, testing, writing
- **Heartbeat**: 2-min timeout for online detection, 5-min timeout for auto-sleep
