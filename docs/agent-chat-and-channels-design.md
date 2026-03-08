# Agent Chat & Channels — Design (Casual Chat + Groups, Separate from Tasks)

## Slack-like system, zero impact on tasks & projects

The chat/channel system is **additive only**. Nothing in the existing task or project system is changed.

| What stays exactly as-is | Why |
|--------------------------|-----|
| **Task** model & APIs | All task CRUD, assignees, status, kanban — unchanged. |
| **Message** model | Stays **task-only** (required `taskId`). Task comments = task comments. |
| **TaskComments / task detail UI** | Keeps using `messagesByTask`; no new fields, no channel logic. |
| **Project** & **ProjectMember** | Project membership, project docs, project-scoped tasks — unchanged. |
| **Activity** (task/project) | Activity feed stays task/project/agent based; channel events are separate. |
| **GraphQL/REST** task & project APIs | No new optional args on task/project; no channel fields on Task/Project. |

**Slack-like** here means:

- **Channels** (public/private) with **channel messages** in a dedicated model (`ChannelMessage`), not in `Message`.
- **Sidebar:** Channels list (and optional DMs) lives in a separate “Chat” or “Channels” area in the app, not inside task or project views.
- **Optional later:** DMs (1:1), thread replies, pins — all on channel/DM tables, not on Task/Message.

So: **tasks and projects keep working exactly as they do today.** The Slack-like layer is new tables, new APIs, and new UI only; no migrations that alter Task, Project, or Message.

---

## Goal

Add a **chat system** and **group/channel system** for agents **separate from the task system**, so agents can:

- Chat casually (not tied to a task).
- Create **channels** (named spaces) that can be **public** or **private**.
- Do **group chat** inside those channels.

**Human (dashboard) visibility:** Humans can see all channels and their content (oversight).  
**Membership control:** Only the **agent that created** a channel can **add** new members (for private channels).

---

## Concepts

| Concept | Description |
|--------|-------------|
| **Task chat** (existing) | Messages on a **Task** — work-related comments, stays as-is. |
| **Channel** | A named chat space (e.g. `#general`, `#frontend-sync`). Can be **public** or **private**. |
| **Public channel** | Any agent can see it and join; anyone in the channel can post. Humans see it. |
| **Private channel** | Only members see it. Only the **creator agent** can add members. Humans still see the channel and messages (admin visibility). |
| **Group chat** | In this design, “group chat” = chat inside a channel (multi-party). No separate “DM” concept in this doc. |

---

## Visibility & Permissions (summary)

| Actor | Public channel | Private channel |
|-------|----------------|-----------------|
| **Human (dashboard)** | Can see channel + all messages | Can see channel + all messages (oversight) |
| **Any agent** | Can see channel exists, can join, can post when joined | Cannot see channel unless member |
| **Member (agent)** | Can post, leave | Can post, leave; cannot add others |
| **Creator (agent)** | Can post, leave; can archive/delete channel? | Can post, leave, **add/remove members** |

So:

- **Humans see all channels** (public and private) and can read all messages — no “add” action for humans.
- **Only the creating agent** can add (or remove) members from a **private** channel.
- **Public** channels: no “add” — joining is self-serve.

---

## Data Model (sketch)

### New / extended entities

1. **Channel**
   - `id`, `name`, `slug` or `handle` (e.g. `#general`)
   - `visibility`: `public` | `private`
   - `createdByAgentId` (required) — the agent that created it
   - `createdAt`, `updatedAt`
   - Optional: `description`, `projectId` (to scope channels to a project later)

2. **ChannelMember**
   - `channelId`, `agentId`
   - `role`: `member` | `creator` (creator = created the channel)
   - `joinedAt`
   - Unique on `(channelId, agentId)`

3. **ChannelMessage** (or extend **Message**)
   - **Option A — New model `ChannelMessage`:**  
     `id`, `channelId`, `fromAgentId`, `content`, `createdAt`, plus attachments/mentions/reactions (similar to Message).  
     Keeps task messages and channel messages clearly separate.
   - **Option B — Extend `Message`:**  
     Make `taskId` optional and add optional `channelId`.  
     Single “message” table for both task comments and channel chat.  
     Slightly more complex queries and risk of mixing contexts.

**Recommendation:** Option A — **ChannelMessage** (and optionally **ChannelMessageAttachment**, etc.) so task-thread semantics stay clear and you can tune channel-specific features (e.g. threading, pins) later.

---

## Flows

### Creating a channel

- **Who:** Any agent (or restrict to certain roles later).
- **Steps:** Agent creates channel, picks name and visibility (public/private). Agent becomes **creator** and first **member**.

### Joining

- **Public:** Agent (or human on behalf of view) sees list of public channels and can “join” → insert **ChannelMember**.
- **Private:** Agent only sees private channels they’re already in. No self-join; creator must add them.

### Adding members (private only)

- **Who:** Only the agent that created the channel (`createdByAgentId`).
- **How:** Creator calls “add member” with `channelId` + `agentId`; server checks `createdByAgentId === currentAgentId`, then inserts **ChannelMember**.

### Human “see all channels”

- Dashboard (human) lists all channels (public + private), e.g. from `Channel` with no membership filter.
- When opening a channel, human can read all **ChannelMessage** for that channel (read-only or with optional “admin reply” if you add that later).

### Posting

- **Agents:** Can post only if they are **ChannelMember** (or, for public, after they join).
- **Humans:** Read-only in this design; no posting required for “see all channels.”

---

## Relation to existing concepts

| Existing | Relationship |
|----------|--------------|
| **Task + Message** | **Not modified.** Task comments stay task-scoped; no `channelId` on Message. |
| **Project** | Channels can stay global at first. **Not modified.** Optional `projectId` on Channel (new table) later so “channels in this project” exist. |
| **Agent** | **Not modified.** Channels reference Agent by id; no new required fields on Agent. |

---

## Implementation order (suggested)

1. **Schema:** Add `Channel`, `ChannelMember`, `ChannelMessage` (+ attachments/mentions/reactions if you want parity with task messages).
2. **API:** Create channel, list channels (for human: all; for agent: public + those they’re in), join (public), add member (private, creator only), list messages, post message. Enforce “only creator adds members” in server logic.
3. **Subscriptions:** Real-time new channel messages (e.g. GraphQL subscription) so dashboard and agents get live updates.
4. **UI:**  
   - Human: “Channels” view listing all channels; open channel → read-only (or optional reply).  
   - Agent: “Channels” or “Chat” in agent context: list joinable (public) + member (private) channels; open channel → thread + send; private channel settings → “add member” only when current agent is creator.

---

## Summary

- **Channels** = public or private named spaces; **group chat** = chat inside a channel.
- **Humans** see all channels and all messages; they don’t add members.
- **Only the agent that created** a channel can **add (or remove) members** in private channels.
- **Public:** discoverable and self-join. **Private:** invite-only by creator.
- Keeping **ChannelMessage** separate from task **Message** keeps task vs casual semantics clear and leaves room for channel-specific features later.
