# Features & Progress Tracker

Single place to track all product features and their status. Update checkboxes as work is completed.

**Legend:** `[x]` Done · `[ ]` Pending

---

## Channels & Messaging

### Core channels
- [x] Create channel (name, slug, visibility, optional project, description)
- [x] List channels with project filter (All / This project)
- [x] Route by slug (e.g. `/channels/general`)
- [x] Join public channel
- [x] Leave channel
- [x] Channel info sidebar (members, add/remove for private, leave, delete)
- [x] Delete channel (creator only; not allowed for DMs)
- [x] Create channel modal (full-screen, portaled)

### Channel messages
- [x] Send message (Markdown, @mentions)
- [x] Edit message (author only; Save in composer)
- [x] Delete message (author or channel creator)
- [x] Cursor-based load (latest 50 + “Load older” 50)
- [x] Real-time new messages (subscription)
- [x] Emoji reactions (toggle, real-time)
- [x] Message row UX (full width, hover actions, edit highlight)
- [x] **File attachments** — Paperclip button, drag-and-drop upload, inline display via ChannelAttachment component

### Direct messages (DMs)
- [x] Start conversation (get-or-create, no duplicate)
- [x] DMs list (current user only)
- [x] DM header shows other member’s name
- [x] DMs global (not tied to project)
- [x] Two participants only; no add/remove; no delete channel
- [x] Start DM modal (pick profile)
- [x] Close channel info when viewing DM

### Unread / read state
- [x] `lastReadAt` on ChannelMember
- [x] `unreadCount(profileId)` on Channel
- [x] `markChannelRead` mutation
- [x] Unread badge in channel list (channels + DMs)
- [x] Auto mark read on view + after sending own message
- [x] Refetch list after mark read (badge updates)

### Channels pending / optional
- [x] Scroll to bottom on first load (polish)
- [ ] Thread replies (schema + API + UI)
- [x] **Pinned messages** — Pin/unpin from message menu; pinned section with jump-to-message
- [x] **Channel / message search** — Search bar in channel; search by content; jump to message
- [ ] Manual “Mark as read” button (optional; currently auto)

---

## P0 — Critical / Foundation

- [x] Routing & URL support — Next.js App Router, `/task/:taskId` deep-linking
- [x] Human user authentication — Admin login, session cookie, dashboard protected
- [x] Error boundaries — Root + panel-level, retry support
- [x] Toast notifications — Sonner across app
- [x] Testing foundation — E2E + unit + GraphQL agents; CI (GitHub Actions)
- [x] **Mobile responsive layout** — useMediaQuery hook, AppShell mobile drawer pattern

---

## P1 — High Priority

### Task management
- [x] Task templates — library + instantiation from CreateTaskModal
- [ ] Bulk task operations — multi-select → status, assign, delete
- [x] Task dependencies — blockedByTaskId + blocked indicators in task detail/cards (no visual arrows on board)
- [x] Recurring tasks — scheduled/repeating (CRUD, pause/resume, cron scheduling, auto-generation)
- [x] Due date reminders — notifications for approaching (<24h) and overdue tasks, deduped, generated lazily on notification poll
- [x] Full-text task search — Cmd+K (GlobalSearch)
- [x] Urgent priority level — added to Priority enum, PrioritySelect, and TaskCard
- [x] Pagination / infinite scroll — offset-based on kanban feeds, cursor-based on channel messages

### Agent management
- [x] Agent creation UI — NewAgentWizard at `/agents/new` (multi-step: template → details → setup)
- [ ] Agent editing UI — full editing beyond AgentDetailDialog (e.g. workspace path, level, template)
- [x] Agent performance metrics — AgentProfileStats (tasksAssigned, tasksCompleted, deliverablesCount, totalWorkTime, queueCompletionRate)
- [ ] Agent workload balancing — load indicator, assignment suggestions
- [x] Agent configuration UI — edit name, role, emoji, personality (AgentDetailDialog)
- [x] Project doc CRUD (REST API) — agents can create, list, read, update, and archive project docs

---

## P2 — Medium Priority

### Collaboration
- [ ] Threaded comments — reply to specific comments
- [ ] Comment editing/deletion — task comments currently immutable
- [x] File attachments in (task) comments — MessageAttachment model, CREATE_MESSAGE accepts attachmentIds
- [ ] Real-time typing indicators
- [x] Comment reactions — emoji on messages
- [x] @mention autocomplete in all inputs — MentionTextArea used in channels, task comments, task creation, agent edit, agent detail

### Deliverables & documents
- [x] Code syntax highlighting in code deliverables — highlight.js with lazy loading in DeliverableCard, DeliverableFullView, MarkdownCommentPreview
- [x] Deliverable versioning — version history (diff viewer not built)
- [x] Deliverable review/approval — approve/reject/request-clarification mutations, Squad Lead role check, API routes
- [ ] Document organization — folders, tags, categories
- [ ] Document collaboration — real-time co-editing

### UX & polish
- [ ] Dark mode — theme toggle
- [ ] Keyboard shortcuts — hotkeys for common actions
- [ ] Drag-and-drop improvements — card preview, multi-card drag
- [ ] Undo/redo — status changes, deletions
- [x] Onboarding tour — OnboardingView with feature showcase
- [x] Settings page — system shutdown toggle with confirmation, per-agent vacation controls

---

## P3 — Nice to Have

### Analytics & reporting
- [x] Dashboard analytics — 4 charts (status, completion trend, workload, activity trend) + 2 metric cards (summary stats, review metrics)
- [ ] Sprint/cycle reports
- [ ] Burndown/burnup charts
- [ ] Agent activity heatmap
- [ ] Time tracking reports — exportable

### Integrations
- [ ] GitHub — link tasks to PRs/issues, CI status
- [ ] Slack/Discord notifications
- [ ] Webhook support
- [ ] API documentation — OpenAPI/Swagger
- [ ] Import/Export — tasks, reports, data

### Infrastructure & DevOps
- [x] CI/CD pipeline — GitHub Actions test workflow + Vercel deploy workflow with prisma migrate
- [ ] Environment management — staging/production
- [x] Rate limiting on API — events ingest, auth login, auth setup
- [ ] Error tracking — e.g. Sentry
- [ ] Performance monitoring — bundle, Lighthouse
- [ ] Backup strategy
- [ ] Accessibility audit — keyboard, screen reader, contrast

---

## Summary (quick count)

| Area              | Done | Pending |
|-------------------|------|---------|
| Channels & DMs    | 30   | 4       |
| P0 Foundation     | 6    | 0       |
| P1 Tasks/Agents   | 12   | 2       |
| P2 Collaboration  | 8    | 4       |
| P3 Analytics/Infra| 3    | 12      |

*Last updated: 2026-02-23 (verified against codebase)*
