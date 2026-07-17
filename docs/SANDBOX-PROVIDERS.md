# Sandbox providers (Tier D)

Run an agent's tasks inside an **ephemeral, isolated sandbox** instead of on the runner host. A
sandbox is provisioned per run, the task's runtime executes inside it, output is captured, and the
sandbox is destroyed. Providers are **bring-your-own (BYO)**: the customer stores their own provider
API key in the workspace **secrets vault**; usage bills to their account; we only orchestrate.

## How it works (the seam)

`runTaskInSandbox(workspaceId, taskId, agentId, provider?)` (`apps/web/src/server/services/sandbox-run.ts`):

1. Assemble the task **context bundle** (identity + task + project + linked docs).
2. Resolve the provider — `provider` override, else the agent's `sandboxProvider` field.
3. Build the **runtime command** from the agent's runtime adapter (`shell`/`openclaw`/…).
4. `provider.provision(ctx)` — `ctx.resolveSecret(name)` reads the workspace vault (BYO creds).
5. Inside the sandbox: (git clone the repo if any) → write `TASK.md` → run the runtime command.
6. Capture stdout/stderr/exit → **always** `destroy()` the sandbox (even on failure).

Trigger: the `runTaskInSandbox` GraphQL mutation (RUNNERS-gated, admin) or the service directly. Bind
an agent to a provider with `setAgentSandboxProvider(agentId, provider)`.

## Setup (per workspace)

1. **Enable** the `RUNNERS` feature flag (and `SECRETS_VAULT` to store keys).
2. **Add your provider key(s)** to the workspace secrets vault under the exact secret names the
   provider needs (the `sandboxProviders` query returns `credentialKeys` for each — see below).
3. **Select the provider** on the agent (`setAgentSandboxProvider`).
4. The provider's **vendor SDK** must be installed on the deployment. We ship the SDKs as
   `optionalDependencies`, so a standard install includes them; a provider whose SDK failed to install
   throws a clear `npm i <pkg>` error at run time rather than pretending to work.

`local` is the built-in reference provider — no keys, no SDK; it runs the task in a temp dir on the
host (useful for testing the whole flow). Low-trust/untrusted agents may NOT use `local` (fail-closed
admission) — they must run in an isolating cloud sandbox.

### Running a real runtime in the box

- **Runtime install** — for a real runtime adapter (`codex`/`claude`/`gemini`/`openclaw`), the sandbox
  auto-installs the CLI on first run (`command -v <bin> || npm install -g <pkg>`), so a bare image works.
- **LLM keys** — bind the agent's provider key (e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) as an
  agent secret; it's exported into the box so the runtime can authenticate. Never persisted/logged.
- **Private repos** — add a workspace secret named `GIT_TOKEN` (or `GITHUB_TOKEN`); a git credential
  helper uses it for the clone (the token stays in an env var, never in the URL or remote config).

## Providers & their vault secret names

| Provider | `credentialKeys` (vault secret names) | SDK | Extra setup |
|---|---|---|---|
| `local` | — | — | none (temp dir on host) |
| `e2b` | `E2B_API_KEY` | `e2b` | — |
| `daytona` | `DAYTONA_API_KEY` (+ optional `DAYTONA_API_URL`, `DAYTONA_SANDBOX_IMAGE`) | `@daytonaio/sdk` | — |
| `modal` | `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` (+ optional `MODAL_ENVIRONMENT`) | `modal` | SDK wants Node 22+ |
| `novita` | `NOVITA_API_KEY` | `novita-sandbox` | — |
| `cloudflare` | `CLOUDFLARE_SANDBOX_BRIDGE_URL`, `CLOUDFLARE_SANDBOX_BRIDGE_TOKEN` | — (REST) | deploy the bridge Worker |
| `kubernetes` | `KUBECONFIG` (+ optional `K8S_NAMESPACE`, `K8S_SANDBOX_IMAGE`) | `@kubernetes/client-node` | a reachable cluster |
| `exe-dev` | `EXE_DEV_API_KEY` (+ optional `EXE_DEV_SSH_KEY`, `EXE_DEV_SSH_USER`) | — (HTTP + ssh) | SSH key registered with exe.dev |

### e2b

1. Add a workspace secret named **`E2B_API_KEY`** with your E2B key.
2. `setAgentSandboxProvider(agentId, "e2b")`.
3. Run: `runTaskInSandbox(taskId, agentId)`. The provider calls `Sandbox.create("base", { apiKey })`
   with your vault key, runs the task, and `kill()`s the sandbox.

## Security

- Provider keys live **only** in the workspace vault (AES-256-GCM at rest); they are resolved
  server-side just-in-time and passed to the SDK — never returned to any client, never logged.
- The `sandboxProviders` query exposes only `configured`/`available` booleans + the required secret
  **names** (never values).
- Every mutation is `RUNNERS`-gated and admin-only (arbitrary code execution + credential use).
- Captured output is bounded (64 KB persisted; providers bound in-memory capture too).
