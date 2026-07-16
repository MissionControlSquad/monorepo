# Tier D — Runtime-agnostic execution & connectivity (control-plane → runners)

## Implementation status (as-built — 2026-07-16)

> This section records what actually shipped. The design below is the original plan; a few items
> advanced past it during implementation (noted here). All work is on branch `feat/depth-plugins`,
> additive, behind the `RUNNERS`/`TERMINALS` flags. The OpenClaw provisioning path is unchanged.

**Shipped + tested (typecheck 12/12; ~62 web + 18 runner-package tests):**
- **`RunnerCommand`** raw-shell job (model + migration) with server-side SSH execution on a cloud VM;
  GraphQL + a Run-command panel on the VM page. *(Slice 1)*
- **NAT-safe poll endpoints** — `GET /api/runner/commands` (atomic claim) + `POST /:id/result`;
  `queueAgentCommand` dispatch. *(Slice 2)*
- **Stateless context** — `GET /api/agents/me/context?taskId=` → `AgentContextBundle`
  (`@agentcenter/types`); no persistent memory store. *(Slice 3)*
- **`@agentcenter/runner`** standalone daemon — polls, runs **raw commands *and* agent tasks**
  end-to-end (fetch context → git clone → materialise bundle → spawn runtime → post message + set
  status), stays stateless. CLI `login`/`start`/`run-once`/`run-task`. *(Slice 4 + task-execution
  completion — advanced past the plan, which scoped the daemon to prepare-only.)*
- **Runtime templates** — openclaw/codex/custom/shell → argv + layout (`@agentcenter/utils`).
  *(Slice 5)*
- **Browser Cloud-Shell PTY** — `sshShell` + `/api/terminals/pty` relay + `TerminalConsole` UI.
  *(Slice 6)*
- **BYO hosts (`host` target)** — `RunnerHost` credential store (key encrypted, never returned) +
  direct server-side SSH execution + `/runners` dashboard. *(Advanced past the plan, which listed
  the `host` target as model-ready / execution-deferred.)*
- **Runners dashboard** (`/runners`) — register BYO hosts + run commands, and queue commands an
  agent daemon pulls (surfaces `queueAgentCommand`, which the plan left UI-less).

**Still deferred (only remaining item):** generalizing VM **provisioning** to install non-OpenClaw
runtimes (broaden `DeploymentProvider`, a runtime interface over `cloud-vm.ts`). Large and
infra-only-verifiable — deliberately out of scope; see "Build order → 7" below.

**Human-verify-on-real-infra (code-audited only):** real Hetzner SSH exec, the live PTY byte stream,
the daemon's git-clone + real runtime spawn against a live control plane.

---

## Context

Paperclip is **local**: the agent runtime binds to the same machine as the user, so it has
direct shell/CLI/filesystem access. AgentCenter is a **hosted control plane ("site
management")** — we never run untrusted agent code on our own servers and we are not on the
user's machine. Execution must happen on a **runner** we orchestrate.

The execution substrate already exists and is mature (~3,800 lines + 24 API routes, essentially
stub-free), but it is **coupled to two assumptions**:

1. **Runtime = OpenClaw.** The bridge (`@agentcenter/agentcenter-bridge`) and VM provisioning
   assume OpenClaw is installed. If a runner has Codex, another agent, or *no* agent runtime
   (just a raw shell), there is no first-class way to trigger CLI/shell work.
2. **Connection = SSH-push (inbound).** We SSH into a Hetzner VM. This fails for a **personal
   computer behind NAT/firewall with no SSH server** — we can't reach it.

The user wants the model generalized so we can, like GCP/AWS/Azure Cloud Shell, run
commands against **any** connected endpoint, with **any** (or no) runtime, including machines
that can only make **outbound** connections. This plan makes the runner **connection-agnostic**
and **runtime-agnostic**, without re-inventing what already works for the OpenClaw+SSH+Hetzner
path.

## Deployment models & market positioning (why the runner is optional, not required)

A natural question: why not run **everything on our servers** (fully hosted, user manages nothing)?
The answer is that "fully hosted" and "runner-based" are **not opposites** — a managed runner *is*
the hosted model. One architecture serves two very different market segments:

| | **Managed** (runner is ours) | **Bring-your-own** (runner is theirs) |
|---|---|---|
| Who runs the runner | We provision + run it (our cloud VM — already built) | User's VM / server / personal PC / container |
| User setup | **None** — signs up, agents work | Install the `@agentcenter/runner` daemon (or deploy a VM) |
| Where code + creds live | On our infra | **Never leaves their perimeter** |
| Sales message | "Manage nothing, it just works" | "Your code & credentials never leave your machine — we only orchestrate" |
| Best for | self-serve, SMB, individuals, non-sensitive work | enterprise, regulated (SOC2/HIPAA/GDPR), IP-sensitive, private-network agents |

**Why not hosted-only?** It wins adoption speed but **caps the ceiling** and loads us with the exact
risks a trust-sensitive buyer fears — and that *we* would then own: proprietary **code** on our
servers, customer **credentials/secrets** in our custody (a breach of us = a breach of everyone),
**compliance** burden (some customers legally cannot sub-process to a third party), **blast-radius/
liability** of running agent-generated code on shared infra, our **compute cost** for every task, and
the inability to reach the customer's **private internal systems** (DBs/staging behind their firewall)
from our cloud. Segment B will simply refuse.

**Why the runner model is the strategic choice:** it delivers *both*. Managed = "the runner happens
to be ours" (the hosted, zero-friction experience for Segment A). BYO = the runner on their infra
(the trust moat for Segment B — a promise a hosted-only competitor **cannot** make). The
**stateless** design makes this a per-workspace/agent config switch, not two products: the control
plane is identical; only *where the runner runs* differs. So we ship one architecture, address the
whole market, and never force code/creds out of a customer's perimeter who doesn't want that.

## The full scenario matrix (what must be covered — "nothing missed")

Five independent axes. A concrete deployment picks one value per axis.

**Axis 1 — Where the runner lives**
- W1. Cloud VM we provision (Hetzner). *[built]*
- W2. User's own server (public IP + SSH). *[primitive built: generic sshExec; provisioning Hetzner-specific]*
- W3. User's **personal computer behind NAT** (no public IP, maybe no SSH server). *[GAP]*
- W4. Any arbitrary endpoint the user wants a shell to (Cloud-Shell-to-anywhere). *[GAP]*

**Axis 2 — Who initiates the connection**
- C1. **SSH push** (control-plane → runner, inbound). Needs reachable host + SSH + our key. *[built]*
- C2. **Outbound WebSocket** (runner → cloud, persistent). NAT-safe. *[built for OpenClaw only]*
- C3. **Outbound HTTP poll** (runner → cloud, periodic pull). NAT-safe, simplest, no open socket. *[GAP]*

**Axis 3 — Runtime that executes the work**
- R1. OpenClaw agent. *[built]*
- R2. Another agent runtime (Codex / Claude Code / Aider / custom). *[GAP]*
- R3. **Raw shell / CLI**, no agent runtime. *[primitive built: sshExec; not a first-class job type]*

**Axis 4 — Interaction type**
- I1. Fire-and-forget **job** (run command/task → result). *[raw primitive exists]*
- I2. Interactive **PTY terminal** (live browser shell, like Cloud Shell). *[token-mint built; PTY stream DEFERRED "spec D2"]*
- I3. Long-running **agent session** with live streaming (OpenClaw live view). *[built: live-gateway]*

**Axis 5 — Task sourcing**
- T1. User creates a task in AgentCenter → delivered to runner. *[built via bridge, OpenClaw-only]*
- T2. Recurring/scheduled task → runner picks it up. *[task creation built; delivery to non-OpenClaw runner = GAP]*
- T3. Runner asks "is there work for me?" and pulls (poll model). *[GAP]*

### The three concrete user scenarios map to these gaps
- **"requires Codex/OpenClaw OR anything… trigger CLI/shell without OpenClaw"** → R2 + R3 + first-class job dispatch (I1).
- **"like Google/AWS/Azure CLI terminal to any endpoint"** → W4 + I2 (complete the deferred PTY stream, generalize beyond Hetzner VMs).
- **"personal computer, no SSH, recurring/socket that picks tasks from AgentCenter cloud"** → W3 + C2/C3 (a standalone, runtime-agnostic outbound runner daemon) + T3 (poll/pull).

## Key findings from substrate exploration (refines scope DOWN)

- **The WS wire protocol is already runtime-neutral.** `packages/types/src/live-gateway-protocol.ts`
  defines `vm.hello / vm.ping / vm.agents_report / vm.agent_status / vm.task_done / vm.task_ack /
  vm.session_done` (plugin→MC) and `mc.welcome / mc.pong / mc.deliver_task / mc.notify / mc.error`
  (MC→plugin). Only **4 functions in `packages/mc-bridge-plugin/src/openclaw-local.ts`** touch
  OpenClaw (`listLocalAgents`, `deliverToLocalAgent` = `runEmbeddedAgent`, the 3 `on*` event
  subscribers, `deriveMachineFingerprint`). `ws-client.ts` (transport/auth/reconnect/dedup) is
  fully generic. → A generic runner **reuses the protocol + transport**, reimplements only those 4.
- **A full HTTP-poll path already exists** (the WS is just a push-wakeup on top of it):
  `GET /api/agents/me/heartbeat-preflight` (returns `shouldWork/hasAssignedTasks/…`), then
  `POST /api/tasks/checkout` (atomic lease + fencing token; `TASK_AUTONOMY`-gated), then result
  posts to `POST /api/tasks/{id}/messages` + status endpoints. **Auth = API key** via
  `resolveAgent(request)`. → The NAT-friendly poll model (C3/T3) is **already wired server-side**;
  the gap is a client daemon + a **raw-shell job type** (today everything assumes an agent runtime).
- **Two auth systems**: bridge WS uses a two-phase token (install token → per-machine `vmToken`,
  `vm.hello` handshake, nonce anti-replay; models in `live-gateway.prisma`); the poll path uses
  API keys (Epic #12). Server WS upgrade is in `apps/web/server.ts` (custom Node server), gated by
  the `LIVE_GATEWAY` flag; handler = `live-gateway-handler.ts:handlePluginConnection`.

**Net effect:** the connectivity plumbing (SSH push, outbound WS, HTTP poll) all substantially
exists. The genuine gaps are: (1) a **raw-shell / runtime-agnostic job type** so work can run
without OpenClaw, (2) a **standalone runner daemon** (not an OpenClaw plugin) for the personal-PC
case, (3) the **browser PTY stream** (deferred). This is more "extend + decouple" than "build."

### Generic seams vs OpenClaw-coupled layers (from cloud-vm exploration)
- **Generic / reuse as-is:**
  - `apps/web/src/server/services/ssh.ts` — `sshExec` (arbitrary command, no allowlist),
    `sshExecStream` (chunked stdout/stderr + `done: Promise<code>`), `sshUploadFile`,
    `sshTestConnection`. The one fully runtime-agnostic transport.
  - The **Live Gateway overlay** (`live-gateway.prisma`, `live-gateway-handler.ts`,
    `live-task-delivery.ts`) — explicitly machine-type-agnostic, keyed by `machineFingerprint` /
    `agentSlug`, not by `CloudVM`. This IS the closest existing generic-runner abstraction (a
    messaging overlay, not a lifecycle entity).
- **Deeply OpenClaw-coupled (do NOT refactor in v1):** `cloud-vm.ts:provisionVM` (npm `openclaw`,
  `openclaw gateway` systemd unit, `openclaw.json`), all of `cloud-vm-utils.ts` (`ocExec`,
  `restartGateway`, config read/write), `cloud-vm-ensure.ts`, `cloud-vm-cron.ts` (`openclaw cron`),
  `cloud-vm-paths.ts` (`.openclaw`, user `agentcenter`), `REQUIRED_AGENT_FILES`, the
  `installing_openclaw` status, and the `hetzner`-only `DeploymentProvider` enum. Making Codex a
  first-class *provisioned* runtime on a Hetzner VM = large + infra-only-verifiable; keep it out of
  the near-term slices. The near-term win is raw-shell/poll on ALREADY-reachable or outbound runners.
- **Baseline work delivery today:** an `openclaw cron` per agent makes the VM self-poll (agent reads
  `HEARTBEAT.md` → calls back). The Live Gateway WS is an additive push fast-path on top.
- **No `Runner`/`Environment`/`Sandbox` model exists** — `CloudVM` is a concrete Hetzner+OpenClaw
  record. A new `Runner` abstraction is additive (wraps CloudVM + LiveGatewayConnection), not a rewrite.

## Proposed architecture

Two new first-class concepts, both **additive** (nothing existing is rewritten):

- **`RunnerCommand`** — a raw shell/CLI job: `{ id, workspaceId, targetKind (cloud_vm|agent|host), targetId, command, cwd?, status (queued|running|done|failed|timeout), exitCode?, stdout?, stderr?, requestedByProfileId?, startedAt?, finishedAt? }`. This is the missing "trigger CLI **without** an agent runtime" primitive. Two execution routes share this one model:
  - **SSH-reachable target (CloudVM / BYO host):** the *server* executes it directly via the generic `sshExec`/`sshExecStream` (`apps/web/src/server/services/ssh.ts`) — no daemon needed. Result persisted on the row.
  - **Outbound-only target (personal PC daemon):** the daemon pulls queued commands and posts results (below).
- **`@agentcenter/runner`** — a new standalone daemon (NOT an OpenClaw plugin) for the NAT/personal-PC case. It authenticates as an **Agent** via `Agent.apiKeyHash` (the `resolveAgent` path — the mechanism every REST work-route already uses), then runs a poll loop on **already-existing** endpoints:
  - `GET /api/agents/me/heartbeat-preflight` → should-I-work flags
  - `GET /api/queue?active=true` (its `AgentQueueItem`s) and/or `GET /api/tasks?assigneeId=self`
  - **NEW** `GET /api/runner/commands` (its queued `RunnerCommand`s) → execute shell locally → **NEW** `POST /api/runner/commands/:id/result`
  - reports task output via existing `POST /api/tasks/{id}/messages` + status routes
  It executes `shell` work directly and `agent_task` work by invoking a **configured runtime command template** (openclaw / codex / custom) — so the runtime is pluggable, not hardcoded to OpenClaw.
- **Browser Cloud-Shell (PTY)** — finish the *deferred* transport in `terminals.ts` (spec D2). Everything except the byte stream exists (`openTerminalSession` mints a `ts_` token for **any** `user@host:port`, lifecycle state machine, cwd guard). Add: expose `activateTerminalSession`, and a **PTY WebSocket** on the custom Node server (`apps/web/server.ts`, exactly where the live-gateway WS already lives) that bridges browser ⇄ `sshExecStream(host, "…")` using the one-time connect token. Any host — already authz-ready.

Reuse (do NOT rebuild): `ssh.ts` (`sshExec`/`sshExecStream`/`sshUploadFile`), the Live-Gateway WS server pattern in `apps/web/server.ts` + `live-gateway-handler.ts`, agent-key auth `resolveAgent` (`apps/web/app/api/_lib/resolve-agent.ts`), the `/api/queue` + `/api/tasks?assigneeId=` + heartbeat-preflight + checkout REST surface, `parseSshCommand` + terminal token minting, the `CloudVM` lifecycle, `hashApiKey`.

Do NOT touch in these slices (large, infra-only-verifiable): the OpenClaw provisioning stack
(`cloud-vm.ts:provisionVM`, `cloud-vm-utils`, `cloud-vm-ensure`, `cloud-vm-cron`, `cloud-vm-paths`)
and generalizing `DeploymentProvider`. Making Codex a first-class *provisioned* runtime on a
Hetzner VM is a separate later effort; runtime-pluggability here lives in the daemon's command
template, which needs no VM refactor.

### ✅ OpenClaw is NOT removed — it stays first-class (confirmed)
Everything in this plan is **strictly additive**. The existing OpenClaw path — Hetzner VM
provisioning, the `agentcenter-bridge` plugin, the live-gateway WS, cron heartbeats, `openclaw.json`,
`IDENTITY/HEARTBEAT/PLAYBOOK` files — **continues to work exactly as today, untouched.** OpenClaw
becomes simply **one runtime among several** (`runtime: openclaw`), and a provisioned Hetzner VM is
**one runner kind among several**. The new pieces (`RunnerCommand`, the stateless daemon, the context
endpoint, the PTY stream) sit *beside* it behind their own `RUNNERS`/`TERMINALS` flags. Nothing that
runs on OpenClaw today changes behavior; existing tests for the OpenClaw/cloud-VM path must stay green
in every slice (part of each slice's verification).

## Agent state & memory — the foundational decision (go deep here)

The user's question: when a task runs on a runner, how does the agent's *identity, memory, skills,
files* get there, and where is the **source of truth**? The four options they named:
(1) OpenClaw-style local agent profile; (2) every agent SSH-logs-in carrying its skills/files each
time; (3) store state on the machine once, then only send the task; (4) centralize memory in OUR DB.

**Key insight — "agent state" is not one thing. It splits into three kinds with different owners:**

| Kind | What | Size / churn | Natural source of truth | Already ours? |
|---|---|---|---|---|
| **A. Config / identity** | persona, role, instructions, skills | small, rare change | **our DB** | ✅ agent profiles + Skills (#10) + AgentInstructions (#18) + Teams |
| **B. Workspace / code** | the repo the agent works on | large, but a git repo | **the git remote** (GitHub/…) | ✅ we store the ref: `Project.sourceType/repoUrl` (A.5) |
| **C. Context / "memory"** | what the agent needs to know *for this task* | ephemeral, per-task | **assembled per task from A + B + task data (no persistent store)** | ✅ derived from data we own |

So options 1–4 are really only arguing about **C**. A and B are settled: A lives in our DB
(and today `cloud-vm-ensure` already *materializes* it into OpenClaw's `IDENTITY.md/SKILL.md/…`
files); B is cloned from git by the runner (we never ship code from our DB).

**What Paperclip actually does (grounded — from `doc/memory-landscape.md` +
`doc/plans/2026-03-17-memory-service-surface-api.md` in the paperclip repo):** Paperclip
**deliberately did NOT centralize memory in its own DB.** After surveying the landscape (mem0, AWS
Bedrock AgentCore, MemOS, memsearch, supermemory, …) it adopted a **two-layer model**:
1. **Memory control-plane layer (Paperclip core owns):** binding resolution (**company default +
   per-agent override**, selected by a stable **key** like `default` / `local-markdown` / `mem0-prod`;
   *no per-project binding in V1* — project appears only in scope/provenance), authz, scope,
   **provenance** back to run/issue/comment/document, **usage/cost** attribution, an **inspect** UI,
   and shared **hooks** (pre-run *hydrate*, post-run *capture*).
2. **Provider adapter layer (providers own):** extraction, embedding, ranking, storage engine,
   forgetting. **Plugins are the primary provider path**; the built-in zero-config default is
   **local markdown files on the runner** — the `para-memory-files` skill: a PARA knowledge graph +
   daily notes under `$AGENT_HOME/life/` & `$AGENT_HOME/memory/`. Paperclip core stores the
   **binding + provenance + cost**, *not* the memory content.

So Paperclip's source of truth is **pluggable**, defaulting to **local files** (it's local-first).

**FINAL DECISION (user-confirmed) — STATELESS runner, context assembled per task.** The runner does
**no memory management**. Every task is self-contained: the control plane assembles a **context
bundle** and hands it to the agent for that run; the runner just executes and returns results,
holding nothing between tasks. This is what makes the runner **platform-agnostic** (any OS, any
machine, container, or personal PC) — there is no per-machine agent state to manage, migrate, or lose.

- **What "context" is:** built entirely from data we ALREADY own, per task — the agent's identity +
  skills (#10) + instructions (#18), plus the task itself (title/description), its project (+ repo
  ref, A.5), and its linked docs/deliverables/parent-subtasks. Assembled into one bundle at task
  dispatch. No separate long-term "memory" store in v1.
- **Why this over persistent memory:** simplest, cheapest to reason about, no runner state, no
  fragmentation, works on every platform. It matches "each new task → given context."
- **Runtime-agnostic:** the bundle is written into whatever file layout the runtime expects
  (OpenClaw / Codex / custom) just before the run, then discarded. The runtime owns execution; the
  control plane owns context.

**Alternatives (the "any other way?" — how a stateless agent can get context), for later if wanted:**
1. **Task-derived bundle (v1, recommended)** — assemble from existing entities as above. Zero new
   storage. Ship it.
2. **Retrieval-augmented (scales)** — instead of dumping everything, *retrieve* the most relevant
   docs/prior outputs for THIS task (search/embeddings over the workspace). Add when history grows.
3. **Optional agent scratchpad (light continuity, still no runner state)** — the agent may write a
   short notes blob back to OUR DB at task end; it's injected as extra context next time. All
   control-plane-side and per-task — the runner still manages nothing. Skip it for pure statelessness.
4. **External context provider (future)** — pull context from mem0/AWS/MemOS via the Plugin SDK (#6)
   at the same injection point. Same contract.

If you ever want continuity, it is added at the **control plane** (option 3/2/4), never by giving the
runner memory to manage — so the runner stays stateless and portable regardless.

**Per-task flow (STATELESS, runtime-agnostic):**
1. Dispatch task → runner (any platform/kind).
2. Runner fetches the **context bundle** for the task: `GET /api/agents/me/context?taskId=…`
   (identity + skills + instructions + task + project ref + linked docs/deliverables).
3. **Workspace**: `git clone/pull` the project repo from its remote (ref in the bundle).
4. Runner writes the bundle into the runtime's expected file layout (ephemeral, this run only).
5. **Run** via the configured runtime (OpenClaw / Codex / custom) — or, for a raw job, just the shell
   command (steps 2 & 4 skipped).
6. **Capture** outputs: deliverables → Deliverables; messages → task messages; status → task status.
   *(No memory write-back in v1 — nothing persisted on the runner.)*
7. Report result. Runner discards the run's files; **holds nothing between tasks.**

**What this adds to the build:** a **context-assembly endpoint** — `GET /api/agents/me/context?taskId=`
that composes the bundle from data we already own (agent identity/skills/instructions + the task, its
project, and linked docs/deliverables). **No new persistent store, no `Agent.memoryMode`, no
`AgentMemory` model** in v1. The runner's task loop is fetch-context → clone-workspace → run →
report. This is what keeps the runner stateless and platform-agnostic. *(If continuity is ever wanted,
add an optional scratchpad the control plane injects — never runner-managed state.)*

## Packaging & reusability (which parts are packages vs in apps/web)

Follow the **existing precedent**: `@agentcenter/agentcenter-bridge` (`packages/mc-bridge-plugin`) is
a standalone, independently-bundled client that imports its wire contracts from `@agentcenter/types`
— and the **server imports the same types** (e.g. `live-gateway-protocol.ts`), so client and server
never drift. We mirror that exactly.

| Component | Location | Reusable? | Rationale |
|---|---|---|---|
| **Shared contracts** — `RunnerCommand` DTO, poll/result payloads, **context-bundle** payload, runtime-template types | **`@agentcenter/types`** (`packages/types`) | ✅ imported by BOTH server + daemon | single source of truth; no duplication/drift (same pattern as `live-gateway-protocol.ts`) |
| **Pure logic** — runtime-template→argv, memory-format helpers, command validation | **`@agentcenter/utils`** | ✅ shared | already where our pure helpers live (`skill-lint`, `collision`, `monitors`, …) |
| **Runner daemon** — enroll, poll loop, fetch context, execute, report, `bin` | **`packages/runner`** → new **`@agentcenter/runner`** | ✅ the reusable artifact — ships as an npm bin, runs on any machine | mirrors the bridge package (own `esbuild` bundle, `typecheck`, versioned); NOT an OpenClaw plugin — a standalone stateless daemon/CLI |
| **DB models** — `RunnerCommand` (memory/state models NOT needed — stateless) | **`packages/database`** (prisma schema) | ✅ shared prisma client | all models live here |
| **Control-plane** — RunnerCommand service, memory service, REST routes, GraphQL, dashboard UI | **`apps/web`** | ✗ (it *is* the app) | every epic's server + UI lives here; not meant to be reused |

**Rule of thumb:** anything the **daemon** and the **server** must agree on → `@agentcenter/types`;
anything that runs **on the user's machine** → `@agentcenter/runner` (its own package); the
**control plane** stays in `apps/web`. This guarantees the daemon is a clean, shippable, reusable
package and the client/server contract has one definition. (Optional future: a thin
`@agentcenter/runner-core` if we want the poll/execute engine embeddable by third parties — not needed
for v1; `@agentcenter/runner` can export its internals if that arises.)

## Multi-client reachability (web / desktop / mobile — confirmed)

The API is already a **header-token HTTP API**, not cookie-only, and is **already consumed by the
mobile app** — so Tier D endpoints are reachable by every client for free, if we follow the existing
rules:
- **GraphQL** at `/api/graphql` authenticates via the `Authorization: Bearer mc_…` header
  (`apps/web/app/api/graphql/route.ts` → `resolveTenancy.fromApiKey`) *and* the `bb-workspace-token`
  cookie. **`apps/mobile`** (Expo/React Native) already builds a urql client against `${url}/api/graphql`
  with a token attached in `fetchOptions.headers` (`apps/mobile/src/api/client.ts` + `AuthContext`,
  token in `expo-secure-store`) and a `graphql-ws` subscription client. It imports the **shared
  `@agentcenter/graphql-client`** package.
- **REST** routes authenticate via the same `Authorization: Bearer` header (`resolveAgent` /
  `resolveTenancy`), not cookies.

**Consequence for Tier D — two rules make it "just work" on desktop + mobile:**
1. **All new GraphQL queries/mutations go in `@agentcenter/graphql-client`** (the shared package the
   web + mobile already import). Adding them there makes them available to web, mobile, and desktop
   with zero per-client work.
2. **All new REST routes authenticate by `Authorization: Bearer` header** (never cookie-only) — which
   my design already does (`resolveAgent` for the runner/memory endpoints). Header-token auth is what
   lets the daemon, mobile, desktop, and any native client call them. (Electron renderer / RN fetch
   are not subject to browser CORS; if a desktop *renderer* on a different origin ever needs it, add
   permissive CORS on the specific routes — a one-liner, flagged if it comes up.)

Net: nothing in Tier D is web-only. Control-plane logic stays in `apps/web`, but its **API surface**
(GraphQL via the shared client + header-authed REST) is consumed identically by web, desktop, and
mobile — exactly as `apps/mobile` already does today.

## How it works — end-to-end, per machine type

**The universal task lifecycle (same for every runner — stateless):**
`assign task → runner obtains it → runner GET /api/agents/me/context?taskId= (identity+skills+
instructions+task+project+linked docs) → git clone/pull the repo → write bundle into the runtime's
file layout (this run only) → run via the runtime → POST deliverables/messages/status → discard
everything.` The runner keeps **nothing** between tasks. Auth on every call = the agent's
`Authorization: Bearer mc_…` key (`resolveAgent`). "How it obtains the task" is the only thing that
differs by machine type:

### 1) Managed cloud VM (our Hetzner VM) — the "manage nothing" experience
- **Setup:** user clicks *Deploy* → `cloud-vm.ts` provisions a Hetzner VM, installs OpenClaw + the
  bridge, configures agents. **User installs nothing.** (Unchanged today.)
- **Agent task (OpenClaw, existing):** task assigned → `live-task-delivery` pushes `mc.deliver_task`
  over the VM's outbound bridge WS → OpenClaw runs the agent → posts results → `vm.task_ack`.
  Fallback = the `openclaw cron` heartbeat pull. *(Untouched.)*
- **Raw command (new):** admin hits *Run command* → `RunnerCommand` row → **server** runs it via
  `sshExec(vm, cmd)` → exit/stdout/stderr persisted → shown in the VM's UI. No agent runtime needed.
- **Code/creds:** on our managed VM. This is your "fully-hosted" experience — the runner is just ours.

### 2) BYO server (user's own cloud/server, public IP + SSH)
- **Setup:** user registers a host + SSH key. No OpenClaw required.
- **Raw command:** `RunnerCommand` → **server** `sshExec`s **directly on their host** → results back.
  This is "trigger CLI without OpenClaw" for any reachable box.
- **Agent task:** same stateless lifecycle; the runtime template (openclaw/codex/custom) is invoked
  over SSH, context fetched per task.
- **Code/creds:** stay on **their** server; we connect inbound over SSH with their key.

### 3) Personal PC behind NAT (no SSH, no public IP) — the daemon
- **Setup:** `npm i -g @agentcenter/runner` (or a prebuilt binary) → `runner login` (paste an agent
  key, or device-auth) → `runner start`. It makes **outbound connections only** — works behind any
  NAT/firewall, no ports opened, no SSH server.
- **Task flow (pull):** the daemon polls `GET /api/agents/me/heartbeat-preflight`; when there's work
  it pulls `GET /api/runner/commands` (raw shell) and/or `GET /api/queue` / `GET /api/tasks?assigneeId=self`
  (agent tasks). For each: run it (shell directly, or the stateless agent lifecycle above), then
  `POST …/result` / post messages+status. Atomic claim prevents double-run.
- **Code/creds:** stay on **their PC** — **nothing leaves the machine** except task results they
  choose to send. This is the enterprise trust story + the NAT-safe personal-PC scenario in one.

### 4) Browser Cloud-Shell to ANY endpoint (like GCP/AWS/Azure)
- **Flow:** user opens a terminal in the dashboard, types `ssh user@host` (any endpoint) →
  `openTerminalSession` validates the shape + mints a one-time `ts_` token → the browser opens the
  **PTY WebSocket** (`apps/web/server.ts`, same place as the live-gateway upgrade) with that token →
  server verifies it, opens `sshExecStream(host, …)`, and pipes bytes both ways (xterm.js ⇄ SSH PTY).
- **Code/creds:** the SSH credentials target the user's endpoint; we relay the byte stream, store none.

**How the runtime is chosen (any runtime, or none):** each agent/runner carries a `runtime` +
command template (`openclaw` / `codex` / `custom argv` / `shell`=none). The daemon/VM renders the
template with the task + context to launch the right tool. OpenClaw stays the default; Codex or a raw
command are just different templates — no engine rewrite.

## Build order (each slice: schema/util → service → REST/gql → client → UI → test)

1. **`RunnerCommand` + server-side SSH execution (R3 / I1 — "CLI without OpenClaw" on reachable hosts).**
   New model + migration; service `runCommandOnVM(vmId, command)` wrapping `sshExec` (persist
   exit/stdout/stderr); GraphQL `runnerCommands` query + `runCommand`/`cancelRunnerCommand`
   mutations (admin, new `RUNNERS` flag); a "Run command" panel on the cloud-VM detail page +
   history. **Fully server-testable** (integration test mocks/uses sshExec). Highest value, lowest risk.

2. **Runner-command poll endpoints (C3 / T3 — NAT-safe pull).**
   `GET /api/runner/commands` (agent-key auth via `resolveAgent`, returns this agent's queued
   `RunnerCommand`s) + `POST /api/runner/commands/:id/result` (report exit+output; atomic claim so
   two pollers don't double-run, mirroring `task-checkout`'s lease pattern). Integration-tested with
   an agent key. No new UI. Unblocks outbound-only machines.

3. **Context-assembly endpoint (FOUNDATIONAL — stateless per-task context).**
   `GET /api/agents/me/context?taskId=` (agent-key auth) composes the **context bundle** from data we
   already own — agent identity + skills (#10) + instructions (#18) + the task (title/description) +
   its project (+ repo ref) + linked docs/deliverables. **No new model, no persistent memory store, no
   `Agent.memoryMode`.** Shared bundle type in `@agentcenter/types`. **Fully server-testable.** This is
   what lets a stateless runner run any task on any platform. *(Optional later: a scratchpad the
   control plane injects for continuity — never runner-managed.)*

4. **`@agentcenter/runner` daemon (W3 / R2 — the personal-PC scenario).**
   New package: enroll (paste an Agent key, or device-auth for the interactive case), config
   `{ apiUrl, apiKey, pollIntervalMs, runtimes: { agent_task: "<command template>" } }`. Poll loop +
   the **stateless per-task cycle**: `GET context bundle` → `git clone/pull` workspace → write bundle
   into the runtime's file layout (this run only) → run via runtime template → post deliverables/
   messages/status → discard. Holds nothing between tasks. Executes `shell` jobs directly (skipping
   context). Ship as an npm bin. **Client code** — unit-test the poll/fetch-context/execute/report
   logic with a mocked HTTP+fs layer; real end-to-end needs a running control plane (flagged).

5. **Runtime-agnostic agent jobs (R2 — Codex/other/custom).**
   Formalize the runtime abstraction the daemon + provisioning use: a `runtime-templates` util
   (openclaw/codex/custom → argv + the file layout each expects for config/memory), surfaced in agent
   config + the daemon config. Unit-tested.

6. **Browser Cloud-Shell PTY (W4 / I2 — "cloud shell to any endpoint").**
   Expose `activateTerminalSession`; add the PTY WebSocket handler in `apps/web/server.ts`
   (pattern-match the live-gateway upgrade) that authenticates the `ts_` connect token, opens
   `sshExecStream`, and pipes bytes both ways; xterm.js UI on a `/terminal` (or cloud-VM) view,
   `TERMINALS`-gated. **The one hard-missing transport** — unit-test token/lifecycle; real PTY needs
   a live SSH target (flagged).

7. *(Deferred / separate effort)* Generalize VM **provisioning** to install non-OpenClaw runtimes
   (broaden `DeploymentProvider`, add a runtime interface over `cloud-vm.ts`). Large + infra-only —
   not in this batch; called out so it's not forgotten.

## Critical files (reuse / touch)

- Reuse (unchanged): `apps/web/src/server/services/ssh.ts` (transport); `apps/web/server.ts` (WS
  upgrade pattern); `apps/web/src/server/services/live-gateway-handler.ts`;
  `apps/web/app/api/_lib/resolve-agent.ts` (agent-key auth); `apps/web/app/api/queue/route.ts`,
  `apps/web/app/api/tasks/route.ts`, `apps/web/app/api/agents/me/heartbeat-preflight/route.ts`,
  `apps/web/app/api/tasks/checkout/route.ts`; `packages/utils/src/terminals.ts` (`parseSshCommand`);
  `apps/web/src/server/api-key.ts` (`hashApiKey`).
- New (runner commands): `packages/database/prisma/schema/runner-command.prisma` (+ migration);
  `apps/web/src/server/services/runner-commands.ts`; `apps/web/src/server/graphql/{queries,mutations}/runner-commands.ts`;
  `apps/web/app/api/runner/commands/route.ts` + `.../[id]/result/route.ts`;
  `packages/graphql-client/src/{queries,mutations}/runner-commands.ts`; a run-command UI panel on
  the cloud-VM detail view; new flag `RUNNERS` in `packages/utils/src/feature-flag-keys.ts`.
- New (context): `apps/web/src/server/services/agent-context.ts` (assemble bundle from existing
  entities); `apps/web/app/api/agents/me/context/route.ts`; context-bundle type in `@agentcenter/types`.
  *(No new DB model — stateless.)*
- New (daemon + PTY): `packages/runner/*` (standalone daemon); PTY WS handler in `apps/web/server.ts`
  + xterm.js terminal view; `packages/utils/src/runtime-templates.ts`.
- First step: commit the design as `docs/RUNNER-ARCHITECTURE.md` (this plan, in-repo, beside the code).
- Touch lightly: `terminals.ts` service + mutations (expose `activateTerminalSession`); agent config
  for the runtime template.

## Verification (per slice)

- **Slice 1 (RunnerCommand + SSH exec):** integration test creates a `RunnerCommand`, runs the
  service against a stubbed `sshExec`, asserts exit/stdout/stderr persisted + status transitions +
  RBAC + feature gate; typecheck. Fully local.
- **Slice 2 (poll endpoints):** integration test with an Agent key hits `GET /api/runner/commands`
  + `POST /:id/result`, asserts agent-scoping (can't see another agent's commands), atomic claim
  (two claims → one winner), result persistence.
- **Slice 3 (context-assembly endpoint):** integration test — an agent key fetches
  `GET /api/agents/me/context?taskId=`, asserts the bundle contains identity/skills/instructions +
  the task + project + linked docs/deliverables, and agent-scoping (an agent can't fetch context for a
  task outside its access). Fully local.
- **Slice 4 (daemon):** unit-test the poll→fetch-context→execute→report loop with a mocked HTTP+fs
  layer; run the binary against a local dev server by hand. *Real personal-PC E2E flagged as
  infra-dependent.*
- **Slice 5 (runtime templates):** unit-test template→argv rendering + the per-runtime file layout.
- **Slice 6 (PTY):** unit-test token verify/activate/lifecycle; *real byte-stream needs a live SSH
  target — flagged.* Manual check against a throwaway VM if creds available.
- **Every slice:** `turbo run typecheck` (11/11) + the slice's own test file green in isolation;
  no claim of "works end-to-end" without either a passing test or an explicit infra-needed flag.

The infra-dependent pieces (real Hetzner provisioning, live WS relay, live PTY) are validated by
code-audit + the existing unit/integration suites; I will call out exactly which steps a human must
confirm on real infra.

## Buildbase boundary

All of this is **agent/runner orchestration** (our domain) — not human auth/billing/workspaces
(buildbase). Runner auth reuses our API keys + CLI device-auth. Nothing here duplicates buildbase.
