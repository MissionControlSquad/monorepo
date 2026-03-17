# Plan: Expose Channels System to Agents via REST API

## Context

Agents currently interact with teammates only through task comments (`POST /api/tasks/[id]/messages`). The channels system (public/private channels + DMs) is fully built but only accessible via GraphQL — meaning only the dashboard frontend can use it. We need REST endpoints so agents can have casual conversations, coordinate with humans, and DM teammates.

## New Files (7 route files + PLAYBOOK update)

### 1. `app/app/api/channels/route.ts` — List & create channels

**GET /api/channels** — List channels the agent can access
- Query params: `projectId`, `visibility`, `limit` (default 50)
- Returns public channels + channels where agent is a member
- Mirror logic from `src/server/graphql/queries/channels.ts` `channels` query
- Include `members` and `createdByProfile` in response

**POST /api/channels** — Create a channel
- Body: `{ name, slug, visibility: "public"|"private", description?, projectId? }`
- Reject `visibility: "dm"` (use start-conversation instead)
- Normalize slug (lowercase, trim, replace spaces with `-`)
- Creator becomes first member with `role: "creator"`
- Mirror logic from GraphQL `createChannel` mutation

### 2. `app/app/api/channels/[channelId]/route.ts` — Get channel details

**GET /api/channels/:channelId** — Get a single channel
- Return channel with members and createdByProfile
- If private/dm: verify agent is a member, else 403

### 3. `app/app/api/channels/[channelId]/messages/route.ts` — Get & post messages

**GET /api/channels/:channelId/messages** — List messages
- Query params: `limit` (default 50, max 200), `before` (messageId for pagination)
- Verify membership for private/dm channels
- Include `fromProfile`, `mentions.profile`, `reactions`, `attachments`
- Return `{ messages, hasMore }`
- Mirror logic from GraphQL `channelMessageConnection` query

**POST /api/channels/:channelId/messages** — Post a message
- Body: `{ content, attachmentIds? }`
- Verify agent is a channel member
- Escape HTML with `escapeHtml()`
- Parse mentions: reuse `parseMentionedProfileIds` pattern from GraphQL `channels.ts` (lines 308-346)
  - Structured `@[id:profileId]` via `parseMentionIds(content)`
  - Legacy `@username` / `@firstname` / `@all`
- Create `ChannelMessage` + `ChannelMessageMention` records
- Publish `PubSubEvent.CHANNEL_MESSAGE.CREATED`
- Return message with all relations

### 4. `app/app/api/channels/[channelId]/join/route.ts` — Join public channel

**POST /api/channels/:channelId/join**
- Verify channel is public (reject private/dm)
- Idempotent: if already a member, return existing
- Create `ChannelMember` with `role: "member"`
- Create activity message "Joined the channel." via `createChannelActivityMessage` pattern

### 5. `app/app/api/channels/[channelId]/read/route.ts` — Mark as read

**POST /api/channels/:channelId/read**
- Update `ChannelMember.lastReadAt` to `new Date()`
- Return `{ success: true }`

### 6. `app/app/api/channels/start-conversation/route.ts` — Start/get DM

**POST /api/channels/start-conversation**
- Body: `{ profileId }` (the other person's profileId)
- Generate slug: `dm-{sorted_id1}-{sorted_id2}`
- Return existing DM if found, else create with both members
- Mirror logic from GraphQL `startConversation` mutation

### 7. `app/app/api/channels/[channelId]/messages/[messageId]/reactions/route.ts` — Toggle reaction

**POST /api/channels/:channelId/messages/:messageId/reactions**
- Body: `{ emoji }` (valid: thumbs-up, heart, eyes, checkmark, party, think)
- Toggle: create if missing, delete if exists
- Publish `PubSubEvent.CHANNEL_MESSAGE.REACTION_CHANGED`

### 8. Update PLAYBOOK.md
**File:** `app/src/server/agent-templates/configs/shared/PLAYBOOK.md`

Add a "Channels (Chat & Conversations)" section with:
- List channels, get messages, post messages, join, mark read, start DM, create channel
- When to use channels vs task messages
- Mention formats reference

## Patterns to Follow

All routes use the same auth + response pattern as existing REST endpoints:
```typescript
import { resolveAgent } from "../../_lib/resolve-agent";  // adjust path
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { successResponse, errorResponse, handleError } from "../../_lib/json-response";
import { escapeHtml } from "@/server/sanitize";
import { parseMentionIds } from "@/lib/mentions";
import { prisma } from "@/server/prisma";
import { pubsub, PubSubEvent } from "@/server/pubsub";
```

Mention parsing reuses `parseMentionedProfileIds` logic from `src/server/graphql/mutations/channels.ts` (lines 308-346) — extract it or inline the same pattern.

## Key Reference Files
- `app/app/api/tasks/[id]/messages/route.ts` — REST route pattern (auth, responses, mentions)
- `app/src/server/graphql/mutations/channels.ts` — All channel business logic to port
- `app/src/server/graphql/queries/channels.ts` — Query logic for listing/pagination
- `app/app/api/_lib/resolve-agent.ts` — Agent auth
- `app/app/api/_lib/json-response.ts` — Response helpers
- `app/src/lib/mentions.ts` — Mention parsing utilities

## File Structure
```
app/app/api/channels/
├── route.ts                                          # GET list, POST create
├── start-conversation/
│   └── route.ts                                      # POST start/get DM
└── [channelId]/
    ├── route.ts                                      # GET channel details
    ├── join/
    │   └── route.ts                                  # POST join
    ├── read/
    │   └── route.ts                                  # POST mark read
    └── messages/
        ├── route.ts                                  # GET list, POST create
        └── [messageId]/
            └── reactions/
                └── route.ts                          # POST toggle reaction
```

## Verification
- `npx tsc --noEmit` — no type errors
- `npx vitest run` — existing tests still pass
- Manual test: POST a message with `@[id:xxx]` mention → verify mention record created + pubsub event published
