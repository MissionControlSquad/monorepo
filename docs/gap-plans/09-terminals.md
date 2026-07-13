# Epic #9 — Terminals (session lifecycle + audit)

**Phase:** 4 (Runtime) · **Gap:** 🔴 Runtime-coupled (SSH/PTY streaming) · **Dependencies:** #1
(tenancy), `Agent` (optional owner). Reuses the `api-key` hashing util for the connect token.

Paperclip lets an operator open a terminal into an agent's environment over SSH
(`environment-custom-image-terminal-sessions.ts`): it parses the provider's SSH command, mints a
short-lived connect token, and streams a PTY. The **SSH transport + PTY streaming are runtime-coupled**
and out of scope. This epic ports the **portable, security-relevant core**: the terminal-session
**lifecycle + audit record**, the **injection-safe SSH-command parser**, the **unsafe-cwd guard**, and
a **short-lived hashed connect token**. Actually opening the byte stream is a deferred runtime slice.

## 0. Decisions / deviations
- **D1** — `companyId` → `workspaceId` (no FK). `agentId` is an optional FK → `Agent` (`SetNull`).
- **D2 (scope — no stream)** — v1 records/authorizes sessions but does **not** open an SSH/PTY stream.
  `openTerminalSession` parses + validates + mints a connect token + persists a `pending` record;
  `activateTerminalSession(token)` verifies the token and flips to `active`; `close` ends it. The
  actual PTY/SSH byte stream (and a websocket surface) is the deferred runtime slice.
- **D3 (security — SSH parsing)** — `parseSshCommand` is ported **verbatim**: only `ssh user@host` /
  `ssh -p PORT user@host` / `ssh user@host -p PORT` shapes pass; anything with extra flags (`-i`),
  inline `:port`, a bad port, or `@@` is rejected — so an attacker-supplied "command" can't smuggle
  arbitrary ssh args. `isUnsafeSessionWorkspaceCwd` (verbatim) rejects system-root cwds.
- **D4 (connect token)** — a random token is minted once at open, returned once, stored only as a
  sha256 hash with a short TTL (default 5 min). `activateTerminalSession` verifies it (like
  `verifyApiKey`). The session itself has a longer TTL (default 60 min) after which it is `expired`.
- **D5 (flag off)** — `FLAG_KEYS.TERMINALS` seeded **false** (runtime/operator surface), `admin` only.

## 1. Requirements
- **R1.** `TerminalSession { workspaceId, agentId?, label?, connectionType, status, username?, host?,
  port?, cwd?, connectTokenHash, connectExpiresAt, sessionExpiresAt, lastActivityAt?, closedAt?,
  createdByProfileId? }`.
- **R2.** `openTerminalSession({workspaceId, command, agentId?, cwd?, ...})`: parse `command` via
  `parseSshCommand` (reject `BAD_USER_INPUT` if it doesn't match a supported shape); reject an unsafe
  `cwd`; mint a connect token; persist a `pending` record. Returns the safe record + the plaintext
  `connectToken` (once).
- **R3.** `activateTerminalSession(workspaceId, id, connectToken)`: verify the token (unexpired, matches
  the pending session) → `active` + stamp `lastActivityAt`; else error.
- **R4.** `closeTerminalSession(workspaceId, id)` → `closed` + `closedAt`. `listTerminalSessions` returns
  records **without** `connectTokenHash`.
- **R5.** Pure `parseSshCommand`, `isUnsafeSessionWorkspaceCwd`, `terminalSessionState(session, now)`
  (derives `expired`/`closed` from timestamps). Gated by `requireFeature(FLAG_KEYS.TERMINALS)`,
  workspace-isolated, `admin`.

## 2. Non-goals / guardrails
- **DO NOT** open an SSH connection or PTY stream in v1 (D2).
- **DO NOT** accept an SSH command outside the supported shapes (D3) — no extra flags, no `-i`.
- **DO NOT** return/expose `connectTokenHash`; the plaintext token is shown once (D4).
- **DO NOT** enable `TERMINALS` by default (D5). **DO NOT** FK `workspaceId`.

## 3. Data model — `packages/database/prisma/schema/terminal.prisma`
```prisma
enum TerminalConnectionType { ssh }
enum TerminalSessionStatus  { pending active closed expired }

model TerminalSession {
  id                 String                 @id @default(cuid())
  workspaceId        String
  agentId            String?
  agent              Agent?                 @relation("AgentTerminals", fields: [agentId], references: [id], onDelete: SetNull)
  label              String?
  connectionType     TerminalConnectionType @default(ssh)
  status             TerminalSessionStatus  @default(pending)
  username           String?
  host               String?
  port               Int?
  cwd                String?
  connectTokenHash   String
  connectExpiresAt   DateTime
  sessionExpiresAt   DateTime
  lastActivityAt     DateTime?
  closedAt           DateTime?
  createdByProfileId String?
  createdAt          DateTime               @default(now())
  updatedAt          DateTime               @updatedAt
  @@index([workspaceId, status])
  @@map("terminal_sessions")
}
```
Adds back-relation `terminalSessions TerminalSession[] @relation("AgentTerminals")` to `Agent`.

## 4-8. API / files
- **Flag** `FLAG_KEYS.TERMINALS` (seeded false). Migration `add_terminal_sessions` (1 table, 2 enums).
- **Service** `services/terminals.ts`: verbatim `parseSshCommand`/`isUnsafeSessionWorkspaceCwd` +
  `terminalSessionState`; `openTerminalSession`, `activateTerminalSession`, `closeTerminalSession`,
  `listTerminalSessions`.
- **GraphQL** `types/terminal.ts` (no `connectTokenHash`); `OpenedTerminalSession` simpleObject
  (session + `connectToken`); query `terminalSessions`; mutations `openTerminalSession(command,
  agentId?, cwd?, label?)`, `closeTerminalSession(id)`.
- **UI** `/terminals`: open (ssh command + optional cwd/label) → one-time connect-token reveal; session
  list (state/host/last-activity/close).

## 9. Implementation order
1. Schema + flag. 2. Service + pure helpers + unit tests. 3. GraphQL + integration tests. 4. UI + client.

## 10. Test cases
- Unit: `parseSshCommand` (ported cases — plain, `-p` both positions, redacted-token username; rejects
  scp / `-i` / inline `:port` / bad port / `@@`); `isUnsafeSessionWorkspaceCwd` (system roots vs a real
  path); `terminalSessionState` (pending/active/expired/closed by timestamp).
- Integration: open parses the command + persists host/port/username + mints a token whose hash
  matches; a bad command + an unsafe cwd are rejected; the token/hash never appears in the list;
  activate verifies the token (rejects a wrong/expired token); close ends the session; isolation;
  admin-only; gate.

## 11. Definition of Done
Terminal-session lifecycle (open/activate/close) with injection-safe SSH parsing, unsafe-cwd guard, and
a short-lived hashed connect token; PTY/SSH streaming explicitly deferred; flag off by default;
admin-only + isolated; unit+integration green.

## 12. Risks
- **SSH argument injection** → strict verbatim parser accepts only known shapes (D3); tested against the
  Paperclip rejection cases.
- **Connect-token leakage / replay** → hash-only storage, one-time reveal, short TTL, verify-once
  activation (D4).
- **Escaping into a system dir** → `isUnsafeSessionWorkspaceCwd` rejects system-root cwds.
- **Implying a live shell** → v1 opens no stream (D2); UI/labels say the session is authorized, not
  connected.
