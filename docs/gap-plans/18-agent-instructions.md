# Epic #18 — Agent instructions (AGENTS.md bundles)

**Phase:** 3 (Agent config) · **Gap:** 🟡 Medium (closes a partial on a Paperclip **shipped** milestone) ·
**Dependencies:** #1 (tenancy), `Agent`.

Closes the "Easy AGENTS.md configurations" gap — one of Paperclip's ✅ **shipped** milestones that
AgentCenter only partially covered (an agent had just a `personality` string). Ports Paperclip's agent
**instruction bundle**: a set of named markdown files (`AGENTS.md`, and for a CEO also `HEARTBEAT.md` /
`SOUL.md` / `TOOLS.md`) attached to each agent. Grounded in Paperclip `agent-instructions.ts` +
`default-agent-instructions.ts` (`DEFAULT_AGENT_BUNDLE_FILES`, `loadDefaultAgentInstructionsBundle`).

## 0. Decisions / deviations
- **D1** — instructions are scoped to their `Agent` (FK, cascade delete). The agent carries
  `workspaceId`, so every query is workspace-scoped through the agent (no `workspaceId` on the child).
- **D2 (scope — no filesystem sync)** — Paperclip syncs bundles to/from an agent's working-dir files
  (`syncInstructionsBundleConfigFromFilePath`). That half is filesystem/runtime and **deferred**. v1 is
  the persisted, editable bundle + defaults; delivering the files into a live agent process is a
  runtime seam.
- **D3 (safe file names)** — `fileName` is validated: `*.md`, no path separators or traversal, bounded
  length. Prevents a bundle from smuggling a path (`../`, `/etc/...`).
- **D4 (default bundle by role)** — `defaultBundleFor(role)` returns `["AGENTS.md"]`, or the CEO bundle
  `["AGENTS.md","HEARTBEAT.md","SOUL.md","TOOLS.md"]` when the agent's role/level is a CEO — ported from
  `DEFAULT_AGENT_BUNDLE_FILES`. Seeded content is a sensible starter, not Paperclip's onboarding assets.

## 1. Requirements
- **R1.** `AgentInstruction { agentId, fileName, content, updatedByProfileId? }`, unique per
  `(agentId, fileName)`.
- **R2.** `listInstructions(workspaceId, agentId)`; `upsertInstruction(workspaceId, agentId, fileName,
  content)` (create or replace, validates the name); `deleteInstruction(workspaceId, agentId, fileName)`.
- **R3.** `seedDefaultInstructions(workspaceId, agentId)` creates the role's default bundle for any file
  not already present (idempotent).
- **R4.** Pure `isValidInstructionFileName(name)`, `defaultBundleFor(role)`, `DEFAULT_AGENTS_MD`.
- **R5.** All ops gated by `requireFeature(FLAG_KEYS.AGENT_INSTRUCTIONS)`, workspace-isolated (via the
  agent), `member` (configuring an agent is authoring, not privileged).

## 2. Non-goals / guardrails
- **DO NOT** sync to/from an agent's working-directory files in v1 (D2).
- **DO NOT** accept an unsafe `fileName` (path separators / traversal / non-`.md`) (D3).
- **DO NOT** let an agent from another workspace be targeted (validate the agent is in-workspace).

## 3. Data model — `packages/database/prisma/schema/agent-instruction.prisma`
```prisma
model AgentInstruction {
  id                 String   @id @default(cuid())
  agentId            String
  agent              Agent    @relation("AgentInstructions", fields: [agentId], references: [id], onDelete: Cascade)
  fileName           String
  content            String
  updatedByProfileId String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  @@unique([agentId, fileName])
  @@index([agentId])
  @@map("agent_instructions")
}
```
Adds back-relation `instructions AgentInstruction[] @relation("AgentInstructions")` to `Agent`.

## 4-8. API / files
- **Flag** `FLAG_KEYS.AGENT_INSTRUCTIONS` (default true; startup seed). Migration `add_agent_instructions`.
- **Service** `services/agent-instructions.ts`: pure `isValidInstructionFileName`, `defaultBundleFor`,
  `DEFAULT_AGENTS_MD`; `listInstructions`, `upsertInstruction`, `deleteInstruction`,
  `seedDefaultInstructions`.
- **GraphQL** `types/agent-instruction.ts`; query `agentInstructions(agentId)`; mutations
  `upsertAgentInstruction`, `deleteAgentInstruction`, `seedAgentInstructions`.
- **UI** `/instructions`: agent picker → file list + markdown editor + add file + seed defaults + delete.

## 9. Implementation order
1. Schema + flag. 2. Service + pure helpers + unit tests. 3. GraphQL + integration tests. 4. UI + client + nav.

## 10. Test cases
- Unit: `isValidInstructionFileName` (accepts `AGENTS.md`; rejects `../x.md`, `a/b.md`, `notes.txt`,
  empty, overly long); `defaultBundleFor` (default vs ceo).
- Integration: upsert creates then replaces the same `(agent, file)`; list returns the bundle;
  bad file name rejected; delete removes; `seedAgentInstructions` fills the default bundle idempotently;
  a cross-workspace agent is rejected; isolation; gate.

## 11. Definition of Done
Per-agent markdown instruction bundles (list/upsert/delete/seed) with safe file names + role default
bundles, workspace-scoped through the agent; filesystem sync deferred; gated by AGENT_INSTRUCTIONS +
role; unit+integration green.

## 12. Risks
- **Path smuggling via fileName** → `isValidInstructionFileName` (D3), tested against traversal.
- **Cross-workspace agent targeting** → the agent is fetched workspace-scoped before any write.
- **Implying live delivery** → v1 persists the bundle; delivering it into a running agent is deferred (D2).
