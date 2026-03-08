# Heartbeat / Agent Config Versioning — Plan

## Problem

- Users today **manually** update agent workspace files (HEARTBEAT.md, PLAYBOOK.md, AGENTS.md, etc.) when we ship changes.
- They have **no signal** that the system was upgraded or that new APIs/behaviours exist.
- There is no **agent-level** notion of “this agent is on config v1, system is v2 → show upgrade available.”

## Goal

1. **Version in the prompt** — Each generated agent config has a **config version** (e.g. `1` or `2025.2`) embedded so the agent “knows” what it’s running.
2. **Agent reports version on wake/sync** — When the agent wakes up, it sends its version **along with auth** (e.g. in `agent.sync_identity` or on first call). Backend stores it per agent.
3. **Backend knows “current” system version** — A single **current config version** (in code or env) that we bump when we change HEARTBEAT, PLAYBOOK, or add new APIs.
4. **Upgrade available at agent level** — Backend compares agent’s version vs current; if agent is behind, user sees **“Upgrade available”** for that agent (and optionally what’s new).

---

## Design (agent-level versioning)

### 1. Config version in generated files

- **Where:** Inject a version into the agent workspace at **generation time** (create agent, re-setup). Same value everywhere so the agent can read it from one place.
- **Options:**
  - **A.** Single line in **HEARTBEAT.md** (e.g. at top): `Config version: {{configVersion}}` — agent reads this and sends it on sync.
  - **B.** Small **VERSION** or **CONFIG_VERSION** file in the workspace with just the version string.
  - **C.** In **AGENTS.md** in a short “System” block: “Config version: X”.
- **Recommendation:** (A) or (C) to avoid an extra file; HEARTBEAT is read every cron run so the agent will see it. AGENTS.md is read every session too. Pick one and document “when you sync, send this version”.

- **Value:** From a **single source of truth** in the app (e.g. `CURRENT_CONFIG_VERSION` in `agent-config-generator.ts` or a small `config-version.ts`). All generated configs use this.

### 2. Agent reports version with auth / on sync

- **sync_identity** (already used at session start):
  - Extend payload: `configVersion?: string`.
  - Backend: validate (optional), then **store on Agent** (e.g. `Agent.configVersion`).
- **Optional:** If we want version even when agent doesn’t call sync (e.g. only calls `/api/agents/me`), we could later add a dedicated “ping” or keep relying on sync. For “upgrade available” we can derive it from **stored** `configVersion` on the agent, so sync is enough for now.

### 3. Backend: current system version

- **Constant (or env):** e.g. `CURRENT_CONFIG_VERSION = "1"` (or semver `"2025.2"`). Bump when:
  - HEARTBEAT.md / PLAYBOOK.md / PLAYBOOK-LEAD.md change in a way that requires new files.
  - New APIs are added that agents should use (optionally list in changelog).
- **Single place:** e.g. `src/server/config-version.ts` or inside `agent-config-generator.ts`. Used by:
  - Config generation (inject into templates).
  - Comparison when returning “upgrade available”.

### 4. Upgrade available (agent-level)

- **Storage:** Add `configVersion` (nullable string) to **Agent** in Prisma. Set on `agent.sync_identity` when `configVersion` is present.
- **GET /api/agents/me:**
  - Return the agent record as today.
  - Add **computed** (or in serialization):
    - `configVersion` — agent’s reported version (from DB).
    - `currentConfigVersion` — system’s current version (from constant).
    - `upgradeAvailable` — `true` when `configVersion == null` (old HEARTBEAT, never reported) or `configVersion !== currentConfigVersion`. So agents on old files without configVersion still see "Upgrade available."
- **Dashboard:** When listing or showing an agent, if `upgradeAvailable` then show a badge/banner: “Upgrade available” and optionally “Re-setup this agent to get new HEARTBEAT/PLAYBOOK and APIs.”

### 5. Optional: changelog / “what’s new”

- Later we can add a short **changelog** (e.g. markdown or JSON) keyed by version so the UI can show “What’s new in v2”. Not required for the first cut.

---

## Implementation checklist (high level)

- [x] **Add `configVersion` to Agent (Prisma)** — nullable string, set on sync. Migration: `20260215000000_add_agent_config_version`.
- [x] **Define `CURRENT_CONFIG_VERSION`** in code; use it in `generateAgentConfig()` and inject into templates. See `src/server/config-version.ts`.
- [x] **Templates:** Add `{{configVersion}}` in chosen place(s) and document: “On sync, send this version.”
- [x] **HEARTBEAT.md (worker + lead):** In Step 0 (Sync), state: “Include your config version from this file in the sync payload.”
- [x] **sync_identity:** Accept `configVersion` in payload; persist to `Agent.configVersion` in `src/server/events/ingest.ts`.
- [x] **GET /api/agents/me:** Include `configVersion`, `currentConfigVersion`, `upgradeAvailable` in response (and keep existing fields).
- [x] **Dashboard (agents list / agent detail):** Show “Upgrade available” when `upgradeAvailable === true`; link to re-setup or docs.

---

## Versioning semantics (when to bump)

- **Patch / small:** Typo fixes, clarifications in HEARTBEAT that don’t change steps → optional to bump or use patch (e.g. 1.0.1).
- **Minor:** New optional API or new step in HEARTBEAT that is backward-compatible → bump minor (e.g. 1.1).
- **Major:** Breaking change to steps or required APIs → bump major (e.g. 2.0).

Starting with a single integer (e.g. `1`) is fine; we can switch to semver later if needed.

---

## Security and hardening

- **configVersion on sync_identity:** Trimmed and capped at 64 chars before store to avoid abuse/DoS.
- **sync_identity string fields:** name (500), personality (5000), workspacePath (500), identityEmoji (16), avatar (2048) are trimmed and capped; empty name is rejected (kept as existing). Optional fields only included when defined (no accidental overwrite with null).
- **GET /api/agents/me:** Response omits `apiKeyHash` and `apiKeyCreatedAt` so sensitive fields are never sent to the client.
- **Config bundle:** Uses `$API_KEY` placeholder only; plain API key is never returned.
- **Admin-only:** `GET /api/agents/[id]/config-bundle` and `POST .../request-config-upgrade` require admin session (middleware). Session cookie is httpOnly, sameSite: lax, secure in production.
- **Agent scope:** `GET /api/agents/me/config-bundle` is keyed by Bearer token; agents only get their own bundle (no IDOR).
- **Upgrade task:** Title/description are server constants (no user input), so no injection.
- **Download filename:** Dashboard sanitizes agent slug and version for the downloaded JSON filename (alphanumeric, dash, underscore only) to avoid path traversal or unsafe filenames.
- **Considerations:** No rate limiting on request-config-upgrade. If you add multi-tenant/orgs, enforce that the admin’s org owns the agent before creating tasks or returning config.

---

## Summary

| Piece | Responsibility |
|-------|----------------|
| **Prompt (HEARTBEAT/AGENTS)** | Contains `Config version: X` so the agent can read and report it. |
| **Agent (on wake)** | Sends `configVersion` in `agent.sync_identity` (with auth). |
| **Backend** | Stores `configVersion` on Agent; compares to `CURRENT_CONFIG_VERSION`; exposes `upgradeAvailable` on `/api/agents/me` and wherever agent is returned. |
| **Dashboard** | Shows “Upgrade available” per agent when `upgradeAvailable` is true; user can re-run setup to refresh files. |

This keeps versioning **agent-level**, tied to auth/sync, and gives users a clear signal when the system has been upgraded and they need to refresh their agent’s config files.
