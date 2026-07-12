# Epic #15 — Boardroom (board concierge chat)

**Phase:** 6 (Polish) · **Gap:** 🟠 Runtime-coupled (LLM relay) · **Dependencies:** #1 (tenancy).

Ports Paperclip's board concierge chat (`routes/board-chat.ts`): a standing conversation where a human
operator talks to a board-level assistant that helps run their agent company. In Paperclip the relay
spawns the local `claude` CLI and streams SSE; that half is **runtime-coupled and single-operator only**
(`local_trusted`, loopback). This epic ports the **portable, security-relevant core** — the standing
thread, the history-injection-safe prompt assembly, and concierge persistence — with the LLM relay
behind a **deferred seam** (a default "unavailable" relay), matching how #2/#5/#7/#8 deferred their
runtime-injection slices.

## 0. Decisions / deviations
- **D1** — `companyId` → `workspaceId`. The standing "Board Operations" issue → a `BoardThread` row
  (one standing thread per workspace); comments → `BoardMessage` rows.
- **D2 (relay seam)** — `sendBoardMessage` persists the user turn, assembles the (injection-safe)
  prompt, calls a `BoardRelay`, then persists the assistant turn. The default `unavailableRelay`
  returns a fixed "not configured on this instance" reply so the feature is end-to-end functional and
  fully testable **without** a live LLM. Wiring the real `claude`-CLI/SSE relay is a documented
  follow-up (it needs the loopback/single-operator guards Paperclip enforces).
- **D3 (experimental, off by default)** — Paperclip gates this behind `enableConferenceRoomChat` (off by
  default). We mirror that: `FLAG_KEYS.BOARD_CHAT` is **seeded `false`** (opt-in), unlike every other
  epic flag. `admin` only (it is an operator surface).
- **D4 (security — history injection)** — ported verbatim: `serializeTurn` wraps each body in a
  `<turn role=…>` tag with `</turn` neutralized, so an untrusted body can't fabricate assistant turns;
  `stripActionSignals` removes `%%ACTIONS%%…%%/ACTIONS%%` blocks from persisted assistant replies.

## 1. Requirements
- **R1.** One standing `BoardThread` per workspace (`getOrCreateBoardThread`), titled "Board Operations".
- **R2.** `sendBoardMessage(workspaceId, body)`: persist a `user` `BoardMessage`; assemble a prompt from
  the last N (=20) turns (oldest-first, role-tagged, injection-safe) + the board skill preamble; call
  `BoardRelay`; persist the returned reply as an `assistant` `BoardMessage` after `stripActionSignals`.
- **R3.** Pure `serializeTurn`, `stripActionSignals`, `assembleHistory(messages, n)`, `buildBoardPrompt(
  skill, history)` — no I/O, unit-tested.
- **R4.** `boardThread` read returns the thread + messages (oldest-first). All gated by
  `requireFeature(FLAG_KEYS.BOARD_CHAT)` (off by default), workspace-isolated, `admin`.
- **R5.** The default relay is `unavailableRelay`; a real relay is injected later (D2).

## 2. Non-goals / guardrails
- **DO NOT** spawn a subprocess / stream SSE in v1 (runtime seam deferred — D2).
- **DO NOT** enable `BOARD_CHAT` by default (experimental — D3).
- **DO NOT** drop the injection defenses when porting (D4).
- **DO NOT** FK `workspaceId`.

## 3. Data model — `packages/database/prisma/schema/boardroom.prisma`
```prisma
enum BoardRole { user assistant }

model BoardThread {
  id          String        @id @default(cuid())
  workspaceId String
  title       String        @default("Board Operations")
  messages    BoardMessage[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  @@unique([workspaceId])   // one standing thread per workspace
  @@map("board_threads")
}

model BoardMessage {
  id        String      @id @default(cuid())
  threadId  String
  thread    BoardThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  role      BoardRole
  body      String
  authorId  String?     // profile id for a user turn; null for assistant
  createdAt DateTime    @default(now())
  @@index([threadId, createdAt])
  @@map("board_messages")
}
```

## 4-8. API / migration / files
- **Flag** `FLAG_KEYS.BOARD_CHAT` (seeded **false**). Migration `add_boardroom` (2 tables, 1 enum).
- **Service** `services/boardroom.ts`: pure helpers + `BoardRelay`/`unavailableRelay` +
  `getOrCreateBoardThread`, `listBoardMessages`, `sendBoardMessage`.
- **GraphQL** `types/boardroom.ts` (BoardThread + BoardMessage); query `boardThread`; mutation
  `sendBoardMessage`.
- **UI** `/boardroom`: message list (user right / concierge left) + composer.

## 9. Implementation order
1. Schema + migration + flag. 2. Service + pure assembly + unit tests. 3. GraphQL + integration tests.
4. UI + client + nav.

## 10. Test cases
- Unit: `serializeTurn` neutralizes a `</turn>` in the body; `stripActionSignals` removes an
  `%%ACTIONS%%…%%/ACTIONS%%` block (and leaves clean text); `assembleHistory` caps at N, oldest-first,
  role-tags concierge vs user; `buildBoardPrompt` contains the skill + history.
- Integration: `sendBoardMessage` persists a user + an assistant turn to the standing thread; a second
  send reuses the same thread (unique per workspace); `boardThread` returns them oldest-first;
  isolation; admin-only; gate (default off → denied; enabled → allowed).

## 11. Definition of Done
A workspace-standing board thread with injection-safe prompt assembly + concierge persistence, working
end-to-end via the default relay; real LLM relay is a documented deferred seam; experimental flag off
by default; admin-only + isolated; unit+integration green.

## 12. Risks
- **Prompt/history injection** → tagged turns + `</turn` neutralization + action-signal stripping (D4).
- **Lending the server shell to remote users** → no subprocess in v1; the real relay ships with
  Paperclip's loopback/single-operator guards (deferred).
- **Accidental exposure** → flag seeded off; admin-only.
