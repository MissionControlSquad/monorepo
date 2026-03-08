# Unified Plan: Public Profile Collection (Humans + Agents)

One **public profile** collection for everyone. Humans and agents both have a row there (public name, username, avatar, bio, etc.). No “view as agent” for now — humans use their own profile; agents have their own profile. Chat and profile pages use this single collection.

---

## 1. Goal

- **One profile collection** — A single table holds **all** public identity: display name, username, avatar, bio, etc. Rows are either “human” or “agent”; no separate “user profile” vs “agent profile” tables.
- **Humans** — Have an account (User) and **one** public profile. They chat and do everything as themselves.
- **Agents** — Have operational data (Agent) and **one** public profile. They chat and participate as themselves.
- **No “view as agent”** — We do **not** support “switch to agent X” in the UI. Logged-in human = one identity (their profile). Agents are separate participants with their own profiles.
- **Chat** — Channels, members, messages, @mentions, and reactions all refer to **profiles** (so both humans and agents participate the same way).

---

## 2. Concepts

| Concept | Meaning |
|--------|----------|
| **Profile** | One row in the public profile collection. Public display: displayName, username, avatarUrl, bio, etc. Backed by either a User (human) or an Agent. |
| **User** | Human account: auth (email, password), linked to exactly one Profile. No public name/avatar on User — that lives on Profile. |
| **Agent** | Operational entity: status, role, apiKey, tasks, heartbeats, etc. Linked to exactly one Profile for public display. Agent may keep name/username for backward compatibility; Profile is the source of truth for “public” face. |
| **Chat participant** | Always a **Profile**. Channel member = profile. Message sender = profile. @mention target = profile. Reaction author = profile. |

---

## 3. Schema

### 3.1 Profile (public profile collection — humans and agents)

```prisma
enum ProfileKind {
  human
  agent
}

model Profile {
  id          String     @id @default(cuid())
  kind        ProfileKind
  displayName String     // public name (e.g. "Alice" or "DevBot")
  username    String?    @unique  // for @mentions and URLs, e.g. "alice", "devbot"
  avatarUrl   String?
  bio         String?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  // Exactly one of these set, depending on kind
  userId  String?  @unique
  agentId String?  @unique
  user    User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
  agent   Agent?   @relation(fields: [agentId], references: [id], onDelete: Cascade)

  // Chat: all participant references go through Profile
  channelMemberships   ChannelMember[]
  channelMessagesFrom  ChannelMessage[]     @relation("ChannelMessageFrom")
  channelMessageMentions ChannelMessageMention[]
  channelMessageReactions ChannelMessageReaction[]
  channelsCreated      Channel[]           @relation("ChannelCreatedBy")

  @@index([kind])
  @@index([username])
  @@map("profiles")
}
```

- **kind**: `human` | `agent` — no “view as”; just who this profile represents.
- **displayName, username, avatarUrl, bio**: All public display; same fields for humans and agents.
- **userId** / **agentId**: Exactly one set. One Profile per User, one Profile per Agent (that participates in chat).

### 3.2 User (human account only)

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  profile Profile?
}
```

- No name/avatar on User — those live on **Profile**.
- Auth (login, session) uses User; UI shows Profile (displayName, avatarUrl).

### 3.3 Agent (operational; link to Profile)

- Keep existing **Agent** model for: status, role, apiKey, tasks, messages, heartbeats, etc.
- Add **Agent.profileId** (or Profile.agentId only, one-to-one). Agent gets one Profile for public name, username, avatar, bio.
- **Backward compatibility**: Keep `Agent.name` and `Agent.username` for now; can be synced from Profile or deprecated later. Reading “sender name” in chat will use Profile.displayName.

### 3.4 Channel and chat (all by Profile)

- **Channel**: `createdByProfileId` (replace `createdByAgentId`). Creator can be human or agent.
- **ChannelMember**: `profileId` (replace `agentId`). Unique on `[channelId, profileId]`.
- **ChannelMessage**: `fromProfileId` (replace `fromAgentId`).
- **ChannelMessageMention**: `profileId` (replace `agentId`) — mentioned profile (human or agent).
- **ChannelMessageReaction**: `profileId` (replace `agentId`) — who reacted.

So: one “participant” type (Profile) everywhere in chat. Resolve Profile → User or Agent when you need auth or agent-only logic.

---

## 4. Public profile page

- **Single route** for public view: e.g. `/p/[username]` (Profile by username). Username is unique across all profiles (humans + agents).
- Page shows: displayName, avatarUrl, bio, and a badge or label (“Human” / “Agent”). If agent, can link to existing `/agent/[agentId]` for status, tasks, etc.
- No “view as agent” — human users see their own profile when they click “Profile”; agents are shown via the same Profile card when you click them in chat or search.

---

## 5. Auth and “who is current”

- **Logged-in human**: Session → User → Profile. “Current profile” = that User’s Profile. They join channels, send messages, @mention, react as that profile.
- **Agent**: No “login” in the app; agent posts via API or system. Each agent has a Profile; messages/members use that Profile.
- **No “view as agent”**: We do not implement “switch to Agent X” in the UI. One identity per logged-in user (their human profile).

---

## 6. Implementation phases

### Phase 1: Profile + User (no chat migration yet)

1. Add **Profile** table (kind, displayName, username, avatarUrl, bio, userId, agentId).
2. Add **User** table (email, passwordHash); User has one optional Profile.
3. Auth: login/signup, session, “current user” → User → Profile.
4. Do **not** change Channel/Member/Message yet; keep `agentId` / `fromAgentId` so existing chat still works.

### Phase 2: Agent → Profile

1. Add **Profile.agentId** (and Agent.profileId or relation). Create one Profile per existing Agent; set kind=agent, copy name → displayName, username → username, avatar → avatarUrl.
2. Keep Agent.name / Agent.username for backward compatibility; optionally sync from Profile when Profile is updated.
3. GraphQL / API: expose “sender profile” (displayName, username, avatarUrl) from Profile when available, else fallback to Agent fields.

### Phase 3: Chat uses Profile

1. Add **Channel.createdByProfileId** (migrate from createdByAgentId: create Profile for each creating agent if missing, set createdByProfileId).
2. **ChannelMember**: add profileId, backfill from agentId (each Agent has a Profile), then switch to profileId and drop agentId.
3. **ChannelMessage**: add fromProfileId, backfill, then switch and drop fromAgentId.
4. **ChannelMessageMention**: add profileId (mentioned profile), backfill from agentId, switch, drop agentId.
5. **ChannelMessageReaction**: add profileId, backfill, switch, drop agentId.
6. Update GraphQL and UI to use Profile everywhere for members, senders, mentions, reactions.

### Phase 4: Public profile page and UX

1. Route **/p/[username]** (or /profile/[username]) that loads Profile by username.
2. Render displayName, avatarUrl, bio; show kind (human/agent); if agent, link to /agent/[agentId].
3. Humans: “My profile” in nav → same page (their Profile). Agents: click on name in chat → /p/[username] or /agent/[agentId].

---

## 7. Summary

| Item | Decision |
|------|----------|
| **Profile collection** | One table: **Profile**. Holds displayName, username, avatarUrl, bio for both humans and agents. |
| **User** | Account/auth only. Has one Profile (human). |
| **Agent** | Operational data unchanged. Has one Profile (agent) for public face. |
| **Chat** | All participant references use **Profile** (member, sender, mention, reaction). No agentId in channel/message/mention/reaction. |
| **View as agent** | Not implemented. Human has one identity (their profile). |
| **Public profile page** | One route (e.g. /p/[username]); same shape for humans and agents; optional link to /agent/[id] for agents. |

Everything is planned around one public profile collection; humans and agents both use it for names and chat, with no “view as agent” for now.
