/**
 * Tier D — the sandbox EXECUTION SEAM: actually run an agent's task inside a provisioned sandbox and
 * bring the result back. This is the control-plane orchestration that turns the SandboxProvider
 * building block into a working feature (provision → clone repo → materialise the task → run the
 * runtime command → capture → destroy). Ported from Paperclip's environment run-orchestrator
 * (acquire → realize → execute → release), simplified for our in-process provider model (ephemeral
 * per-run, no lease table / plugin-worker RPC).
 *
 * Provider-agnostic: the same seam drives `local` (real, no keys — what the tests exercise) and every
 * cloud provider (e2b/daytona/…). Credentials are BYO from the workspace vault via the provision ctx.
 */
import { GraphQLError } from "graphql";
import {
  buildAdapterInvocation,
  getAdapter,
  canonicalAdapterKey,
  deriveAdapterExecutionResult,
  requiresSandboxContainment,
  resolveEffectiveWorkspaceStrategyType,
  redactRunSecrets,
  renderAdapterTranscript,
  estimateRunCostCents,
  FLAG_KEYS,
  type TrustLevel,
  type AdapterExecutionResult,
  type AdapterErrorFamily,
  type AdapterExitReason,
} from "@agentcenter/utils";
import {
  runHermesGateway,
  HERMES_GATEWAY_ADAPTER_TYPE,
  hermesGatewaySecretRefName,
  type HermesGatewayConfig,
  type HermesGatewayResult,
} from "@/server/adapters/hermes-gateway";
import type { AgentContextBundle } from "@agentcenter/types";
import { getProfileAgentId } from "@agentcenter/database";
import { prisma } from "@/server/prisma";
import { isFeatureEnabled } from "@/server/feature-flags";
import { assembleContextBundle } from "./agent-context";
import { getSandboxProvider } from "./sandbox-providers";
import { resolveWorkspaceSecret, resolveEnvForAgent } from "./secrets";
import { captureRunMemory } from "./agent-memory";
import { enqueueMemoryJob } from "./memory-jobs";
import { stampRunReview } from "./run-review";
import { scheduleRunRetryIfTransient } from "./run-retry";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { assertExecutionAllowed } from "./execution-policy";
import { resolveEnvironmentExecution, type EnvExecutionResolution } from "./environments";
import { acquireLease, releaseLease, coerceLeasePolicy } from "./environment-leases";
import {
  getPrimaryProjectWorkspace,
  recordExecutionWorkspace,
  recordWorkspaceOperation,
} from "./execution-workspaces";
import { beginRunStatus, setRunPhase, appendRunLog } from "./run-runtime-status";
import { appendRunLog as appendRunLogChunk, finalizeRunLog } from "./run-log-store";
import { attachRunBridgeToken } from "./run-bridge";
import { resolveActiveImageRef } from "./environment-custom-images";
import { recordCostEvent } from "./cost";
import {
  registerRunAbort,
  unregisterRunAbort,
  requestRunCancellation,
  isRunActive,
  cancelReasonFromSignal,
} from "./run-cancellation";
import { env as env_ } from "../env";
import type { SandboxProvider, SandboxHandle } from "./sandbox/types";
import type { AgentTrustProfile, EnvironmentLease } from "@agentcenter/database";

const MAX_OUTPUT_CHARS = 45_000;
const MAX_MESSAGE_CHARS = 8_000;
const DEFAULT_TIMEOUT_MS = 600_000;

// §3 #11 (1) — map a task's Priority enum to the numeric AgentRun.priority the run-queue drain orders by
// (higher dispatches first). An unknown/absent priority ranks 0 (same as a plain FIFO run).
const RUN_PRIORITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, urgent: 3 };
function runPriorityFromTask(priority: string | null | undefined): number {
  return RUN_PRIORITY_RANK[priority ?? ""] ?? 0;
}

/** The subset of an agent the admission path needs (loaded with its trust profile). */
type AdmissionAgent = {
  sandboxProvider: string | null;
  environmentId: string | null;
  trustLevel: TrustLevel | null;
  trustProfile: Pick<AgentTrustProfile, "lowTrustContainment"> | null;
};

/**
 * Resolve the concrete execution target for a run and enforce fail-closed admission — shared by the
 * synchronous (runTaskInSandbox) and background (enqueueSandboxRun) paths so they never diverge.
 * Precedence: explicit override → the agent's bound Environment → the agent's ad-hoc sandboxProvider.
 * Enforces low-trust containment (isolating provider required) and the workspace execution allowlist
 * (using the Environment's real driver) BEFORE anything is provisioned or queued.
 */
async function resolveAndAdmitTarget(
  workspaceId: string,
  agent: AdmissionAgent,
  inputProviderKey?: string | null,
): Promise<{
  provider: SandboxProvider;
  providerKey: string;
  execDriver: string;
  envRes: EnvExecutionResolution | null;
}> {
  const envRes =
    !inputProviderKey && agent.environmentId
      ? await resolveEnvironmentExecution(workspaceId, agent.environmentId)
      : null;
  if (envRes && envRes.providerKey === null) {
    throw new GraphQLError(
      `Environment driver "${envRes.driver}" is not yet runnable via the sandbox seam. Use a local or sandbox environment.`,
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }
  const execDriver = envRes?.driver ?? "sandbox";

  const providerKey = (inputProviderKey ?? envRes?.providerKey ?? agent.sandboxProvider) || null;
  if (!providerKey) {
    throw new GraphQLError("No sandbox provider is configured for this agent", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  const provider = getSandboxProvider(providerKey);
  if (!provider) {
    throw new GraphQLError(`Unknown sandbox provider: ${providerKey}`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  // Fail-closed admission: a low-trust/untrusted (or explicitly contained) agent must run in an
  // ISOLATING sandbox — never on the control-plane host (the `local` provider).
  const trustLevel = (agent.trustLevel ?? "standard") as TrustLevel;
  if (
    requiresSandboxContainment({
      trustLevel,
      lowTrustContainment: agent.trustProfile?.lowTrustContainment,
    }) &&
    !provider.isolating
  ) {
    throw new GraphQLError(
      `Agent is ${trustLevel}-trust and must run in an isolated sandbox — provider "${providerKey}" runs on the host. Configure an isolating cloud sandbox provider.`,
      { extensions: { code: "FORBIDDEN" } },
    );
  }

  // Workspace execution allowlist (Plan 4): deny an inadmissible target BEFORE provisioning/queuing.
  await assertExecutionAllowed(workspaceId, { driver: execDriver, provider: providerKey });

  return { provider, providerKey, execDriver, envRes };
}

/** Post the run outcome to the task timeline as a message from the agent (best-effort). */
async function postRunToTask(
  agentId: string,
  taskId: string,
  summary: string,
  runId?: string,
): Promise<void> {
  try {
    const fromProfileId = await getOrCreateAgentProfileId(agentId);
    await prisma.message.create({
      data: {
        taskId,
        fromProfileId,
        content: summary.slice(0, MAX_MESSAGE_CHARS),
        // Parity §3.12 — attribute the timeline post to the run that produced it.
        createdByRunId: runId ?? null,
      },
    });
  } catch {
    // Never fail the run because the timeline post failed.
  }
}

/**
 * Persist a run's captured output to the durable run-log store, then finalize (sha256 + totalBytes).
 * Best-effort: the durable transcript is an observability surface, never a correctness dependency of a
 * run, so a store failure must not fail the run. Chunks are written sequentially to keep seq/byteOffset
 * ordered; redaction is applied inside appendRunLogChunk.
 */
async function persistRunLog(
  workspaceId: string,
  runId: string,
  chunks: { stream: "stdout" | "stderr"; data: string }[],
): Promise<void> {
  try {
    for (const c of chunks) {
      await appendRunLogChunk(workspaceId, runId, c.stream, c.data);
    }
    await finalizeRunLog(workspaceId, runId);
  } catch {
    // Never fail a run because the durable transcript could not be written/sealed.
  }
}

function shq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Map a structured {@link AdapterExecutionResult} to the additive AgentRun columns (PR #99 tail).
 * Returns an empty object when there is no structured result, so the spawn of a blob-only adapter
 * writes nothing new. Best-effort: this is observability metadata, never a correctness dependency.
 */
function executionColumns(execution: AdapterExecutionResult | undefined): {
  usageTokensIn?: number;
  usageTokensOut?: number;
  usageModel?: string | null;
  errorFamily?: string | null;
  exitReason?: string;
} {
  if (!execution) return {};
  return {
    ...(execution.usage
      ? {
          usageTokensIn: execution.usage.tokensIn,
          usageTokensOut: execution.usage.tokensOut,
          usageModel: execution.usage.model,
        }
      : {}),
    ...(execution.errorFamily ? { errorFamily: execution.errorFamily } : {}),
    exitReason: execution.exitReason,
  };
}

/**
 * Cost half (§3 #2): price a finished run from its captured token usage + model against the curated
 * rate-card, PERSIST it onto the AgentRun (`costCents` + `costStatus`), and emit a `CostEvent`
 * attributing the spend to the agent/model/task/run (the CostEvent funnel fans it into every budget
 * policy). No-op when the run captured no usage (a blob-only adapter with no token counts) so we never
 * write a bogus $0. An UNKNOWN model prices at 0 with `priced:false` → persisted + emitted as
 * `unpriced` (never silently billed as the real cost; repriceable later via repriceCostEvent).
 *
 * HOW COST IS COMPUTED: cents = round(tokensIn/1e6 * $in/Mtok + tokensOut/1e6 * $out/Mtok). Example —
 * a claude-opus-4-8 run with 100 in / 50 out → ~$0.0053 → 1 cent (priced). An unknown model → 0 cents,
 * costStatus "unpriced". Best-effort: cost accounting must NEVER fail a run, so this returns the columns
 * to fold into the terminal write and swallows any CostEvent error.
 *
 * Returns the AgentRun cost columns to merge into the terminal update (empty when there is no usage).
 */
async function persistRunCost(input: {
  workspaceId: string;
  agentId: string;
  taskId: string | null;
  projectId?: string | null;
  runId: string;
  execution: AdapterExecutionResult | undefined;
}): Promise<{ costCents?: number; costStatus?: string }> {
  const usage = input.execution?.usage;
  if (!usage) return {}; // no captured token usage → nothing to price
  const cost = estimateRunCostCents({
    model: usage.model,
    tokensIn: usage.tokensIn,
    tokensOut: usage.tokensOut,
  });
  const costStatus = cost.priced ? "reported" : "unpriced";
  try {
    await recordCostEvent({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      model: usage.model ?? null,
      taskId: input.taskId,
      projectId: input.projectId ?? null,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      amountCents: cost.cents,
      costStatus,
      source: "run",
      // Attribute to THIS run + make the emission idempotent (a re-run of the finalizer won't double-bill).
      idempotencyKey: `run:${input.runId}`,
    });
  } catch {
    // best-effort — cost accounting must never fail a run
  }
  return { costCents: cost.cents, costStatus };
}

/** The task prompt written into the sandbox as TASK.md (mirrors the runner's taskMarkdown). */
function renderPrompt(b: AgentContextBundle): string {
  const t = b.task;
  const lines = [`# Task #${t.taskNumber}: ${t.title}`, "", t.description ?? "", ""];
  if (b.project?.repoUrl) lines.push(`Repo: ${b.project.repoUrl} @ ${b.project.repoRef ?? "HEAD"}`);
  return lines.join("\n");
}

/**
 * Compose the self-contained shell script the sandbox runs. Pure (exported for tests). Order matters:
 * export the agent's secrets first (so clone auth + the runtime see them), make a workspace, clone the
 * repo, write the task, INSTALL the runtime binary (idempotent), then run it.
 */
export function composeSandboxScript(opts: {
  prompt: string;
  repoUrl?: string | null;
  runtimeCmd: string;
  /** `command -v <bin> || <install>` — installs the runtime binary if missing. */
  installGuard?: string | null;
  /** The agent's bound secrets (LLM API keys, etc.) exported into the box. */
  env?: Record<string, string>;
  /** BYO git token for cloning a PRIVATE repo — wired via a credential helper (stays in an env var). */
  gitToken?: string | null;
  /** Project workspace setup command, run after clone + before the runtime (Plan 3). */
  setupCommand?: string | null;
}): string {
  const exports = Object.entries(opts.env ?? {})
    .map(([k, v]) => `export ${k}=${shq(v)}`)
    .join("\n");
  // Private-repo auth: a git credential helper reads the token from $PC_GIT_TOKEN (never in the URL or
  // the git remote config), so a private HTTPS clone works without leaking the token into args.
  const gitAuth =
    opts.repoUrl && opts.gitToken
      ? `export PC_GIT_TOKEN=${shq(opts.gitToken)}\n` +
        `git config --global credential.helper '!f() { echo username=x-access-token; echo "password=$PC_GIT_TOKEN"; }; f'\n`
      : "";
  const clone = opts.repoUrl ? `git clone --depth 1 ${shq(opts.repoUrl)} repo && cd repo && ` : "";
  return (
    `set -e\n` +
    (exports ? `${exports}\n` : "") +
    gitAuth +
    `mkdir -p workspace && cd workspace\n${clone}` +
    `cat > TASK.md <<'PC_TASK_EOF'\n${opts.prompt}\nPC_TASK_EOF\n` +
    (opts.setupCommand ? `${opts.setupCommand}\n` : "") +
    (opts.installGuard ? `${opts.installGuard}\n` : "") +
    opts.runtimeCmd
  );
}

export interface SandboxRunResult {
  /** The persisted AgentRun id (run ledger row for this execution). */
  runId: string;
  providerKey: string;
  sandboxId: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Derived from the exit: a clean exit → "review", anything else → "blocked". */
  status: "review" | "blocked";
  /**
   * Structured run result when the bound adapter owns an `execute()`/`parseLine` (parity slice) — the
   * typed transcript + usage/errorFamily/exitReason derived from the captured stdout. Absent for
   * blob-only adapters. The usage/errorFamily/exitReason are persisted onto `AgentRun` (additive
   * columns); the full typed transcript stays in-memory on this result.
   */
  execution?: AdapterExecutionResult;
}

/**
 * Run one task inside the agent's configured sandbox provider and return the captured result. Enforces
 * low-trust admission, persists an AgentRun (running→terminal), always destroys the sandbox, and posts
 * the outcome to the task timeline as the agent.
 */
export async function runTaskInSandbox(input: {
  workspaceId: string;
  taskId: string;
  agentId: string;
  /** Override the agent's configured provider (e.g. force `local`). */
  providerKey?: string | null;
  timeoutMs?: number;
  /** buildbase userId who triggered the run (for the run ledger). */
  requestedByProfileId?: string | null;
  /** Reuse an already-created (claimed) AgentRun row instead of creating one — the queue worker path. */
  existingRunId?: string;
  /** DI seam (tests): the fetch used by the Hermes gateway dispatch path. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}): Promise<SandboxRunResult> {
  const agent = await prisma.agent.findFirst({
    where: { id: input.agentId, workspaceId: input.workspaceId },
    include: { trustProfile: true },
  });
  if (!agent) throw new GraphQLError("Agent not found", { extensions: { code: "NOT_FOUND" } });

  // Resolve the target (Environment → provider) + enforce trust containment + execution allowlist.
  const { provider, providerKey, execDriver, envRes } = await resolveAndAdmitTarget(
    input.workspaceId,
    agent,
    input.providerKey,
  );

  const bundle = await assembleContextBundle(
    {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      personality: agent.personality ?? null,
      level: agent.level ?? null,
      runtimeAdapter: agent.runtimeAdapter ?? null,
      runtimeModel: agent.runtimeModel ?? null,
      runtimeTemplate: agent.runtimeTemplate ?? null,
      memoryProvider: agent.memoryProvider ?? null,
      workspaceId: agent.workspaceId ?? null,
    },
    input.taskId,
  );

  // Build the runtime command the sandbox will run. http-adapter runtimes have no in-sandbox command.
  const runtimeKey = bundle.runtime?.adapter ?? agent.runtimeAdapter ?? "shell";
  const invocation = buildAdapterInvocation(runtimeKey, {
    taskId: input.taskId,
    workspaceDir: "workspace",
    taskTitle: bundle.task.title,
    prompt: renderPrompt(bundle),
    template: bundle.runtime?.template ?? agent.runtimeTemplate ?? undefined,
    model: bundle.runtime?.model ?? agent.runtimeModel ?? null,
  });
  if (invocation.mode !== "spawn") {
    // Hermes HTTP + SSE gateway (PR #102 tail): the runtime is an already-running remote Hermes server,
    // not a spawned process — dispatch via the gateway service instead of provisioning a sandbox. Every
    // other HTTP-adapter runtime still has no in-sandbox execution path.
    if (canonicalAdapterKey(runtimeKey) === HERMES_GATEWAY_ADAPTER_TYPE) {
      return dispatchHermesGatewayRun({
        workspaceId: input.workspaceId,
        taskId: input.taskId,
        agent,
        providerKey,
        prompt: renderPrompt(bundle),
        model: bundle.runtime?.model ?? agent.runtimeModel ?? null,
        requestedByProfileId: input.requestedByProfileId ?? null,
        existingRunId: input.existingRunId,
        timeoutMs: input.timeoutMs,
        fetchImpl: input.fetchImpl,
      });
    }
    throw new GraphQLError("HTTP-adapter runtimes cannot run inside a sandbox", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const prompt = renderPrompt(bundle);
  // useShell → argv[0] is already a shell command string (run it as-is); otherwise argv is a real
  // argv the shell must exec with each token quoted.
  const runtimeCmd = invocation.useShell
    ? invocation.argv.join(" ")
    : invocation.argv.map(shq).join(" ");
  // Install the runtime binary in a fresh box if the adapter declares one (idempotent guard).
  const adapter = getAdapter(runtimeKey);
  const installGuard =
    adapter?.installCommand && adapter?.binName
      ? `command -v ${adapter.binName} >/dev/null 2>&1 || { ${adapter.installCommand}; }`
      : null;
  // Persist/claim the run ledger row (status=running) BEFORE composing the script — the in-sandbox
  // bridge token is scoped to this run id. The queue worker passes an existing (claimed) row; the
  // synchronous path creates a fresh one.
  const run = input.existingRunId
    ? await prisma.agentRun.update({
        where: { id: input.existingRunId },
        data: { status: "running", startedAt: new Date() },
      })
    : await prisma.agentRun.create({
        data: {
          workspaceId: input.workspaceId,
          agentId: agent.id,
          taskId: input.taskId,
          kind: "sandbox",
          providerKey,
          requestedByProfileId: input.requestedByProfileId ?? null,
        },
      });

  // Inject the agent's OWN bound secrets (LLM API keys, etc.) so a real runtime can authenticate.
  // The Environment's instance-scoped envVars (a non-secret bag) go in first; the agent's resolved
  // secrets take precedence on any key collision.
  const instanceEnvVars = envRes?.envVars ?? {};
  // Audit-on-resolve (Domain 7 P1): this is a REAL use of the agent's secrets (injected into the
  // run), so pass a consumer context — one `injected` access event is written per bound secret.
  const agentSecrets = await resolveEnvForAgent(input.workspaceId, agent.id, {
    actorType: "agent",
    actorId: agent.id,
    consumerType: "agent",
    consumerId: agent.id,
    runId: run.id,
  });
  const env: Record<string, string> = {
    ...instanceEnvVars,
    ...agentSecrets,
  };

  // In-sandbox API bridge (Plan 6): a run-scoped token the in-box agent can use to post progress back
  // to its task. Only injected when a public MC URL is configured; invalidated when the run finishes.
  const bridgeBaseUrl = env_.NEXT_PUBLIC_MC_URL?.replace(/\/$/, "");
  let bridgeToken: string | null = null;
  if (bridgeBaseUrl) {
    bridgeToken = await attachRunBridgeToken(run.id);
    env.AGENTCENTER_API_URL = `${bridgeBaseUrl}/api/runner/bridge`;
    env.AGENTCENTER_RUN_ID = run.id;
    env.AGENTCENTER_RUN_TOKEN = bridgeToken;
  }
  // BYO git token from the workspace vault (GIT_TOKEN, else GITHUB_TOKEN) — only when a repo is cloned.
  const gitToken = bundle.project?.repoUrl
    ? ((await resolveWorkspaceSecret(input.workspaceId, "GIT_TOKEN")) ??
      (await resolveWorkspaceSecret(input.workspaceId, "GITHUB_TOKEN")))
    : null;
  // Execution-workspace realization (Plan 3, flag-gated + additive): resolve the project's named
  // workspace (setup command + default strategy) and the effective strategy for this run. With the
  // flag off, nothing here runs and behavior is unchanged.
  const wsEnabled = await isFeatureEnabled(FLAG_KEYS.EXECUTION_WORKSPACES);
  const projectId = bundle.project?.id ?? null;
  const projectWorkspace =
    wsEnabled && projectId ? await getPrimaryProjectWorkspace(input.workspaceId, projectId) : null;
  const strategyType = resolveEffectiveWorkspaceStrategyType({
    driver: execDriver,
    projectDefaultStrategy: projectWorkspace?.defaultStrategy,
  });

  // Custom image overlay (Plan 5, flag-gated): boot from the environment's active captured image, if any.
  const imageRef =
    envRes?.environmentId && (await isFeatureEnabled(FLAG_KEYS.CUSTOM_IMAGES))
      ? await resolveActiveImageRef(envRes.environmentId, providerKey)
      : null;

  const script = composeSandboxScript({
    prompt,
    repoUrl: bundle.project?.repoUrl,
    runtimeCmd,
    installGuard,
    env,
    gitToken,
    setupCommand: projectWorkspace?.setupCommand ?? null,
  });

  const ctx = {
    workspaceId: input.workspaceId,
    resolveSecret: (name: string) => resolveWorkspaceSecret(input.workspaceId, name),
  };

  // The exact secret VALUES this run resolved into its environment (LLM keys, bridge token, GIT_TOKEN,
  // …). These must never survive into stored/streamed/posted run output, so every output sink below is
  // scrubbed against this set: the live tail, the persisted stdout/stderr, the run->task message, the
  // memory summary, and the failure message. Only TRUE secrets are scrubbed - the agent's resolved
  // vault secrets, the run-scoped bridge token, and the git token - never the Environment's non-secret
  // instance envVars (those are meant to appear in output).
  const secretValues = [
    ...Object.values(agentSecrets),
    ...(bridgeToken ? [bridgeToken] : []),
    ...(gitToken ? [gitToken] : []),
  ];

  // Live status (Plan 6): track a redacted, TTL'd tail of this run so the UI can watch it mid-flight.
  // Secret VALUES (env + git token) are scrubbed from every streamed chunk.
  beginRunStatus(run.id, secretValues);

  // In-flight cancellation (§3 #2): register an AbortController keyed by this run id BEFORE exec so
  // `cancelAgentRun` can abort the running exec. Its signal is threaded into handle.exec below; the
  // finalizer reads `signal.aborted` to mark the run `canceled`. Always unregistered in the finally.
  const abortController = registerRunAbort(run.id);

  let handle: SandboxHandle | undefined;
  let lease: EnvironmentLease | null = null;
  try {
    // Acquire an execution machine via the lease layer: a `reuse_by_environment` env re-attaches to a
    // kept machine; ephemeral (and ad-hoc, no-env) runs provision a fresh one. Release honors the policy.
    const acquired = await acquireLease({
      workspaceId: input.workspaceId,
      environmentId: envRes?.environmentId ?? null,
      provider,
      ctx,
      policy: coerceLeasePolicy(envRes?.leasePolicy),
      taskId: input.taskId,
      runId: run.id,
      spec: imageRef ? { image: imageRef } : undefined,
    });
    handle = acquired.handle;
    lease = acquired.lease;
    setRunPhase(run.id, "running");

    let exitCode: number | null;
    let stdout: string;
    let stderr: string;
    let timedOut = false;
    let canceled = false;
    // Durable transcript capture: buffer every streamed chunk (in order, with its stream) so we can
    // persist the FULL redacted transcript to the run-log store after exec. Kept separate from the
    // synchronous live tail above; ordering is guaranteed by persisting sequentially post-exec.
    const logChunks: { stream: "stdout" | "stderr"; data: string }[] = [];
    try {
      const result = await handle.exec(script, {
        timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        signal: abortController.signal,
        onLog: (chunk) => {
          appendRunLog(run.id, chunk.data);
          logChunks.push({ stream: chunk.stream, data: chunk.data });
        },
      });
      exitCode = result.exitCode;
      // Redact resolved secret values BEFORE the tail slice so a secret straddling the cut can't leak
      // a partial. Everything downstream (persist, run->task post, memory summary, return) derives from
      // these already-redacted strings.
      stdout = redactRunSecrets(result.stdout, secretValues).slice(-MAX_OUTPUT_CHARS);
      stderr = redactRunSecrets(result.stderr, secretValues).slice(-MAX_OUTPUT_CHARS);
      timedOut = result.timedOut ?? false;
      // The exec was terminated by a cancel request (its AbortSignal fired) — the provider killed the
      // child. Distinct from a timeout kill; drives the terminal `canceled` status below.
      canceled = result.aborted === true || abortController.signal.aborted;
    } catch (execErr) {
      // exec itself blew up - persist whatever transcript we captured (best-effort), then release as a
      // failure (retain_on_failure keeps the box) and re-throw.
      await persistRunLog(input.workspaceId, run.id, logChunks);
      setRunPhase(run.id, "failed");
      await releaseLease({ lease, handle, outcome: "failure" });
      throw execErr;
    }

    // Persist + seal the full transcript to the run-log store (redaction happens inside append). The
    // truncated tail on AgentRun (below) stays for quick display. Best-effort - never fail the run.
    await persistRunLog(input.workspaceId, run.id, logChunks);

    // Release the machine per the lease policy (ephemeral destroys; reuse keeps; retain keeps on fail).
    await releaseLease({
      lease,
      handle,
      outcome: exitCode === 0 && !timedOut ? "success" : "failure",
    });

    const runStatus = canceled
      ? "canceled"
      : timedOut
        ? "timeout"
        : exitCode === 0
          ? "done"
          : "failed";
    setRunPhase(run.id, runStatus);

    // Adapter-owned structured result (parity slice): if the bound adapter owns an `execute()` (or at
    // least a `parseLine`), derive the typed transcript + usage/errorFamily/exitReason from the captured
    // stdout. Pure derivation, best-effort — never fail a run over parsing. Derived BEFORE the terminal
    // update so usage/errorFamily/exitReason persist on AgentRun in the same write.
    let execution: AdapterExecutionResult | undefined;
    if (adapter?.execute || adapter?.parseLine) {
      try {
        const execInput = { stdout, stderr, exitCode, timedOut };
        execution = adapter.execute
          ? adapter.execute(execInput)
          : deriveAdapterExecutionResult(adapter, execInput);
      } catch {
        // ignore parse/derivation failures — the blob result is still returned below
      }
    }

    // When the runtime was driven in stream-json mode its stdout is machine JSONL - show the PARSED
    // assistant transcript on the task timeline (and in the memory summary) instead of raw JSONL. Blob
    // adapters (no transcript) fall back to the raw captured stdout unchanged.
    const parsedOutput =
      execution?.transcript && execution.transcript.length
        ? renderAdapterTranscript(execution.transcript)
        : "";
    const displayOutput = parsedOutput || stdout;

    // Cost half (§3 #2): price the run from its captured usage, emit the CostEvent, and fold the
    // costCents/costStatus columns into the terminal write. Empty for a no-usage (blob) run.
    const costColumns = await persistRunCost({
      workspaceId: input.workspaceId,
      agentId: agent.id,
      taskId: input.taskId,
      projectId,
      runId: run.id,
      execution,
    });

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        sandboxId: handle.id,
        status: runStatus,
        exitCode,
        stdout,
        stderr,
        finishedAt: new Date(),
        bridgeTokenHash: null, // invalidate the in-sandbox bridge token now the run is over
        ...executionColumns(execution),
        ...costColumns,
        // Cancellation (§3 #2): a canceled run overrides the derived exitReason and records the reason.
        ...(canceled
          ? { exitReason: "canceled", cancelReason: cancelReasonFromSignal(abortController.signal) }
          : {}),
      },
    });

    // Record the realized execution workspace + phase operations (Plan 3, flag-gated). Best-effort —
    // never fail a run because bookkeeping failed.
    if (wsEnabled) {
      try {
        const ew = await recordExecutionWorkspace({
          workspaceId: input.workspaceId,
          projectId,
          projectWorkspaceId: projectWorkspace?.id ?? null,
          taskId: input.taskId,
          runId: run.id,
          strategyType,
          name: `run-${run.id.slice(0, 8)}`,
          repoUrl: bundle.project?.repoUrl ?? null,
          baseRef: bundle.project?.repoRef ?? null,
          providerType: providerKey,
          providerRef: handle.id,
        });
        if (bundle.project?.repoUrl) {
          await recordWorkspaceOperation(ew.id, "clone", {
            command: `git clone ${bundle.project.repoUrl}`,
          });
        }
        if (projectWorkspace?.setupCommand) {
          await recordWorkspaceOperation(ew.id, "setup", {
            command: projectWorkspace.setupCommand,
            status: exitCode === 0 ? "done" : "failed",
          });
        }
        await recordWorkspaceOperation(ew.id, "run", { command: runtimeCmd, exitCode });
      } catch {
        // ignore recording failures
      }
    }

    // Post the outcome to the task timeline (as the agent) so the run is visible in the workflow.
    await postRunToTask(
      agent.id,
      input.taskId,
      `Sandbox run (${providerKey}) - ${runStatus}${exitCode != null ? `, exit ${exitCode}` : ""}\n\n${displayOutput || "(no output)"}${stderr ? `\n[stderr]\n${stderr}` : ""}`,
      run.id,
    );

    // Post-run memory auto-capture (Domain 4 GAP-B): persist run residue when the agent's effective
    // provider is `db`. Best-effort — never fails the run; no-op for none/markdown. When the MEMORY
    // flag is on, capture is made DURABLE + async (Paperclip memory-jobs): the run finalizer only
    // ENQUEUES a job and the reap cron drains it, so capture survives process loss. With the flag off
    // we fall back to the original inline capture so nothing regresses.
    const memorySummary =
      `Run ${runStatus} (${providerKey}${exitCode != null ? `, exit ${exitCode}` : ""}).\n${displayOutput || ""}`.trim();
    if (await isFeatureEnabled(FLAG_KEYS.MEMORY)) {
      await enqueueMemoryJob({
        workspaceId: input.workspaceId,
        agentId: agent.id,
        sourceKind: "run",
        sourceRefId: run.id,
        payload: {
          agentProvider: agent.memoryProvider ?? null,
          taskId: input.taskId,
          runId: run.id,
          summary: memorySummary,
        },
      }).catch(() => {}); // best-effort — enqueue must never fail the run
    } else {
      await captureRunMemory({
        workspaceId: input.workspaceId,
        agentId: agent.id,
        agentProvider: agent.memoryProvider ?? null,
        taskId: input.taskId,
        runId: run.id,
        summary: memorySummary,
      });
    }

    // Untrusted-output review gate (Domain 8 G2, LOW_TRUST_REVIEW-gated): stamp the run's reviewState +
    // source-trust from the agent's trust profile. A low-trust/untrusted agent (or one whose profile
    // requires it) → `needs_review` + quarantined; standard/trusted → `approved`. Makes the previously
    // dead requireUntrustedPrReview toggle real. Best-effort — never fails the run.
    if (await isFeatureEnabled(FLAG_KEYS.LOW_TRUST_REVIEW)) {
      await stampRunReview(
        run.id,
        {
          trustLevel: agent.trustLevel ?? null,
          lowTrustContainment: agent.trustProfile?.lowTrustContainment ?? null,
          requireUntrustedPrReview: agent.trustProfile?.requireUntrustedPrReview ?? null,
        },
        { agentId: agent.id },
      );
    }

    // Scheduled-retry (Domain 9 #6): a transient timeout schedules a bounded-backoff re-dispatch (the
    // reap cron promotes it). No-op for a clean failure or an exhausted retry budget. Best-effort.
    if (runStatus === "timeout" && (await isFeatureEnabled(FLAG_KEYS.RUNNERS))) {
      await scheduleRunRetryIfTransient({
        id: run.id,
        status: runStatus,
        retryCount: run.retryCount,
      });
    }

    return {
      runId: run.id,
      providerKey,
      sandboxId: handle.id,
      exitCode,
      stdout,
      stderr,
      status: exitCode === 0 ? "review" : "blocked",
      ...(execution ? { execution } : {}),
    };
  } catch (err) {
    // A cancel that landed DURING provisioning (before/at exec) surfaces here — mark the run canceled
    // (not failed) with its reason, rather than treating the abort as a provisioning failure.
    const wasCanceled = abortController.signal.aborted;
    // Provision/exec threw before we could record a result — mark the run failed, then re-throw.
    setRunPhase(run.id, wasCanceled ? "canceled" : "failed");
    // A provision/exec error message can echo a resolved secret (e.g. a git error printing the token in
    // the remote URL), so scrub it before it is persisted or posted to the task timeline.
    const message = redactRunSecrets(
      err instanceof Error ? err.message : String(err),
      secretValues,
    );
    await prisma.agentRun
      .update({
        where: { id: run.id },
        data: {
          status: wasCanceled ? "canceled" : "failed",
          errorMessage: message,
          finishedAt: new Date(),
          bridgeTokenHash: null, // invalidate the in-sandbox bridge token
          ...(handle ? { sandboxId: handle.id } : {}),
          ...(wasCanceled
            ? {
                exitReason: "canceled",
                cancelReason: cancelReasonFromSignal(abortController.signal),
              }
            : {}),
        },
      })
      .catch(() => {});
    await postRunToTask(
      agent.id,
      input.taskId,
      wasCanceled
        ? `Sandbox run (${providerKey}) canceled: ${cancelReasonFromSignal(abortController.signal)}`
        : `Sandbox run (${providerKey}) failed: ${message}`,
      run?.id,
    );
    throw err;
  } finally {
    // Always release the in-process cancellation controller once this run is done executing.
    unregisterRunAbort(run.id);
  }
}

// ─── Hermes HTTP + SSE gateway dispatch (PR #102 tail) ───────────────────────
// When an agent's runtime adapter resolves to `hermes-gateway` its invocation is an HTTP call to an
// already-running Hermes server — there is nothing to spawn. This path runs the same run-ledger
// lifecycle as the sandbox seam (persist running → stream output through onLog/appendRunLog/the run-log
// store → derive a terminal status → persist the structured result → post to the task timeline) but
// reaches Hermes over HTTP+SSE via `runHermesGateway` instead of provisioning a box.

/** The minimal agent shape the gateway dispatch needs (loaded with all scalars in runTaskInSandbox). */
type GatewayAgent = { id: string; adapterConfig: unknown; runtimeTemplate: string | null };

/** Resolve the per-run session key from the configured strategy (null → no cross-run memory). */
function hermesSessionKey(
  strategy: string | undefined,
  ids: { runId: string; agentId: string; taskId: string },
): string | null {
  switch (strategy) {
    case "run":
      return `agentcenter:run:${ids.runId}`;
    case "agent":
      return `agentcenter:agent:${ids.agentId}`;
    case "issue":
      return `agentcenter:issue:${ids.taskId}`;
    default:
      return null; // "none" | undefined
  }
}

/** Map a Hermes gateway errorCode to the machine-readable {@link AdapterErrorFamily}. */
function hermesErrorFamily(code: string | undefined): AdapterErrorFamily | undefined {
  switch (code) {
    case undefined:
      return undefined;
    case "hermes_gateway_auth_failed":
      return "auth_required";
    case "hermes_gateway_rate_limited":
    case "hermes_gateway_upstream_error":
    case "hermes_gateway_connect_failed":
      return "transient_upstream";
    default:
      return "unknown";
  }
}

/** Derive the structured {@link AdapterExecutionResult} from a Hermes gateway result (parity slice). */
function hermesExecution(
  result: HermesGatewayResult,
  model: string | null,
): AdapterExecutionResult {
  const ok = result.exitCode === 0;
  const errorFamily = ok ? undefined : hermesErrorFamily(result.errorCode);
  const exitReason: AdapterExitReason = ok
    ? "completed"
    : errorFamily === "auth_required"
      ? "auth_required"
      : "error";
  const usage = result.usage
    ? {
        // cache-creation prompt tokens count as input (mirrors deriveAdapterExecutionResult).
        tokensIn: result.usage.inputTokens + (result.usage.cachedInputTokens ?? 0),
        tokensOut: result.usage.outputTokens,
        model,
      }
    : undefined;
  return {
    status: ok ? "success" : "error",
    exitReason,
    ...(usage ? { usage } : {}),
    ...(errorFamily ? { errorFamily } : {}),
    transcript: [],
  };
}

/** Resolve a `HermesGatewayConfig` from the agent's `adapterConfig`, resolving the vaulted API key. */
async function resolveHermesGatewayConfig(
  workspaceId: string,
  agent: GatewayAgent,
  runId: string,
): Promise<{ config: HermesGatewayConfig; apiKey: string }> {
  const cfg = (agent.adapterConfig ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v : undefined;
  // Base URL from adapterConfig, falling back to the agent's runtimeTemplate (the code adapter's slot).
  const apiBaseUrl = str(cfg.apiBaseUrl) ?? str(agent.runtimeTemplate) ?? "";
  // The API key is stored ONLY as a vault secret-ref (never inline) — resolve it now (audited).
  // The adapter-config UI writes a `{ secretRef: { name } }` pointer; a bare string name is also
  // accepted for back-compat with configs saved before the secret-ref binding input.
  const secretRef = hermesGatewaySecretRefName(cfg.apiKeySecretRef);
  const apiKey = secretRef
    ? ((await resolveWorkspaceSecret(workspaceId, secretRef, {
        actorType: "system",
        consumerType: "agent",
        consumerId: agent.id,
        runId,
      })) ?? "")
    : "";
  const config: HermesGatewayConfig = {
    apiBaseUrl,
    apiKey,
    ...(str(cfg.sessionKeyStrategy)
      ? { sessionKeyStrategy: cfg.sessionKeyStrategy as HermesGatewayConfig["sessionKeyStrategy"] }
      : {}),
    ...(str(cfg.instructions) ? { instructions: cfg.instructions as string } : {}),
    ...(cfg.headers != null ? { headers: cfg.headers as HermesGatewayConfig["headers"] } : {}),
    ...(typeof cfg.timeoutSec === "number" ? { timeoutSec: cfg.timeoutSec } : {}),
    ...(typeof cfg.eventReconnectMs === "number" ? { eventReconnectMs: cfg.eventReconnectMs } : {}),
    ...(cfg.dangerouslyAllowInsecureRemoteHttp === true
      ? { dangerouslyAllowInsecureRemoteHttp: true }
      : {}),
  };
  return { config, apiKey };
}

async function dispatchHermesGatewayRun(input: {
  workspaceId: string;
  taskId: string;
  agent: GatewayAgent;
  providerKey: string;
  prompt: string;
  model: string | null;
  requestedByProfileId: string | null;
  existingRunId?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<SandboxRunResult> {
  const { workspaceId, taskId, agent, providerKey } = input;
  // Persist/claim the run ledger row (kind "gateway"). The queue path passes a claimed row.
  const run = input.existingRunId
    ? await prisma.agentRun.update({
        where: { id: input.existingRunId },
        data: { status: "running", startedAt: new Date() },
      })
    : await prisma.agentRun.create({
        data: {
          workspaceId,
          agentId: agent.id,
          taskId,
          kind: "gateway",
          providerKey,
          requestedByProfileId: input.requestedByProfileId,
        },
      });

  const { config, apiKey } = await resolveHermesGatewayConfig(workspaceId, agent, run.id);
  // Only the resolved API key is a true secret — scrub it from every output sink (runHermesGateway also
  // redacts internally; this is defense-in-depth for the persisted/streamed copies).
  const secretValues = apiKey ? [apiKey] : [];
  const sessionKey = hermesSessionKey(config.sessionKeyStrategy, {
    runId: run.id,
    agentId: agent.id,
    taskId,
  });

  // Live status + durable transcript, same seam the sandbox path uses.
  beginRunStatus(run.id, secretValues);
  setRunPhase(run.id, "running");
  const logChunks: { stream: "stdout" | "stderr"; data: string }[] = [];

  try {
    const controller = input.timeoutMs != null ? AbortSignal.timeout(input.timeoutMs) : undefined;
    const result = await runHermesGateway({
      config,
      ctx: { runId: run.id, prompt: input.prompt, sessionKey, model: input.model },
      onLog: (chunk) => {
        appendRunLog(run.id, chunk.data);
        logChunks.push({ stream: chunk.stream, data: chunk.data });
      },
      fetchImpl: input.fetchImpl,
      signal: controller,
    });

    // Seal the durable transcript (redaction happens inside append). Best-effort.
    await persistRunLog(workspaceId, run.id, logChunks);

    const collect = (stream: "stdout" | "stderr") =>
      redactRunSecrets(
        logChunks
          .filter((c) => c.stream === stream)
          .map((c) => c.data)
          .join(""),
        secretValues,
      ).slice(-MAX_OUTPUT_CHARS);
    const stdout = collect("stdout");
    const stderr = collect("stderr");
    const runStatus = result.exitCode === 0 ? "done" : "failed";
    const execution = hermesExecution(result, input.model);
    setRunPhase(run.id, runStatus);

    // Cost half (§3 #2): the gateway path also captures usage — price it + emit the CostEvent.
    const costColumns = await persistRunCost({
      workspaceId,
      agentId: agent.id,
      taskId,
      runId: run.id,
      execution,
    });

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        sandboxId: result.runId ?? HERMES_GATEWAY_ADAPTER_TYPE,
        status: runStatus,
        exitCode: result.exitCode,
        stdout,
        stderr,
        ...(result.errorMessage
          ? { errorMessage: redactRunSecrets(result.errorMessage, secretValues) }
          : {}),
        finishedAt: new Date(),
        ...executionColumns(execution),
        ...costColumns,
      },
    });

    await postRunToTask(
      agent.id,
      taskId,
      `Hermes gateway run (${providerKey}) — ${runStatus}, exit ${result.exitCode}\n\n${stdout || "(no output)"}${stderr ? `\n[stderr]\n${stderr}` : ""}`,
      run.id,
    );

    return {
      runId: run.id,
      providerKey,
      sandboxId: result.runId ?? HERMES_GATEWAY_ADAPTER_TYPE,
      exitCode: result.exitCode,
      stdout,
      stderr,
      status: result.exitCode === 0 ? "review" : "blocked",
      execution,
    };
  } catch (err) {
    // The gateway service shapes its own failures (never throws), so this only catches an unexpected
    // error (e.g. the abort timeout) — mark the run failed with a scrubbed message, then re-throw.
    setRunPhase(run.id, "failed");
    const message = redactRunSecrets(
      err instanceof Error ? err.message : String(err),
      secretValues,
    );
    await persistRunLog(workspaceId, run.id, logChunks);
    await prisma.agentRun
      .update({
        where: { id: run.id },
        data: { status: "failed", errorMessage: message, finishedAt: new Date() },
      })
      .catch(() => {});
    await postRunToTask(
      agent.id,
      taskId,
      `Hermes gateway run (${providerKey}) failed: ${message}`,
      run?.id,
    );
    throw err;
  }
}

/**
 * Enqueue a sandbox run to execute in the BACKGROUND (non-blocking). Validates the agent + provider +
 * fail-closed admission NOW (so an inadmissible run never queues), then persists an AgentRun with
 * status=queued and returns its id immediately. A worker (drainSandboxRunQueue) executes it later.
 */
export async function enqueueSandboxRun(input: {
  workspaceId: string;
  taskId: string;
  agentId: string;
  providerKey?: string | null;
  requestedByProfileId?: string | null;
}): Promise<{ runId: string; providerKey: string }> {
  const agent = await prisma.agent.findFirst({
    where: { id: input.agentId, workspaceId: input.workspaceId },
    include: { trustProfile: true },
  });
  if (!agent) throw new GraphQLError("Agent not found", { extensions: { code: "NOT_FOUND" } });

  // Same resolution + fail-closed admission as the sync path — so an inadmissible run never queues.
  const { providerKey } = await resolveAndAdmitTarget(input.workspaceId, agent, input.providerKey);

  // Coalesce (prevents double-dispatch): a task may have at most one QUEUED run. Two overlapping reap
  // ticks (or a manual enqueue racing the cron) would otherwise create two queued rows → drain claims
  // both → the task runs twice (duplicate commits/PRs/cost). A partial-unique index on
  // (taskId) WHERE status='queued' is the race backstop; the pre-check is the fast path.
  const existing = await prisma.agentRun.findFirst({
    where: { taskId: input.taskId, status: "queued", kind: "sandbox" },
    select: { id: true, providerKey: true },
  });
  if (existing) return { runId: existing.id, providerKey: existing.providerKey ?? providerKey };

  // §3 #11 (1) — stamp the queued run's dispatch priority from the task's Priority so the drain can
  // order higher-priority work ahead of older lower-priority work.
  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: { priority: true },
  });
  const priority = runPriorityFromTask(task?.priority ?? null);

  try {
    const run = await prisma.agentRun.create({
      data: {
        workspaceId: input.workspaceId,
        agentId: agent.id,
        taskId: input.taskId,
        kind: "sandbox",
        providerKey,
        status: "queued",
        priority,
        requestedByProfileId: input.requestedByProfileId ?? null,
      },
    });
    return { runId: run.id, providerKey };
  } catch (err) {
    // Lost the race to a concurrent enqueue → return the winner's queued run instead of a duplicate.
    if ((err as { code?: string }).code === "P2002") {
      const winner = await prisma.agentRun.findFirst({
        where: { taskId: input.taskId, status: "queued", kind: "sandbox" },
        select: { id: true, providerKey: true },
      });
      if (winner) return { runId: winner.id, providerKey: winner.providerKey ?? providerKey };
    }
    throw err;
  }
}

/**
 * Drain queued sandbox runs — the worker (in-process loop on a persistent server, or the
 * run-sandbox-queue cron on serverless). Atomically claims each (queued→running so two workers never
 * double-run) and executes it, reusing its ledger row. Returns how many it STARTED (not skipped).
 *
 * §3 #11 (1) — PRIORITY DISPATCH + PER-AGENT CAP (RUNNERS-gated; the FIFO drain is unchanged when the
 * flag is off):
 *   • Priority: queued runs are scanned priority DESC then createdAt ASC, so a higher-priority run
 *     (AgentRun.priority, stamped from the task's Priority at enqueue) dispatches ahead of an older
 *     lower-priority one. `limit` still caps how many this call starts (the global batch cap).
 *   • Per-agent cap: an agent with `maxConcurrentRuns` set never has a run started while it already has
 *     that many in-flight (status=running, counted across workers) — such runs are left queued for a
 *     later drain. null = unlimited.
 *
 * HOW TO TEST (mirrors the sandbox-run integration suite):
 *   1. Cap: set `agent.maxConcurrentRuns = 1`, insert one `running` AgentRun for it, then enqueue +
 *      drain — the queued run is NOT started (stays queued) because the agent is at capacity. Clearing
 *      the running row and draining again starts it. With the cap null it always starts.
 *   2. Priority: enqueue runs for distinct tasks with different Priority (urgent/high/low). Draining
 *      with limit=1 starts ONLY the urgent one; the rest stay queued in priority order.
 */
export async function drainSandboxRunQueue(limit = 5): Promise<number> {
  const batchCap = Math.min(limit, 20);
  // Caps + priority ordering only apply under RUNNERS; otherwise this is the original FIFO drain.
  const refinementsOn = await isFeatureEnabled(FLAG_KEYS.RUNNERS);

  const queued = await prisma.agentRun.findMany({
    where: { status: "queued", kind: "sandbox" },
    orderBy: refinementsOn ? [{ priority: "desc" }, { createdAt: "asc" }] : { createdAt: "asc" },
    // With caps on, scan a wider window so runs for an at-capacity agent don't starve other agents'.
    take: refinementsOn ? Math.min(batchCap * 5, 50) : batchCap,
    select: { id: true, workspaceId: true, agentId: true, taskId: true, providerKey: true },
  });

  // Resolve per-agent caps once (null = unlimited). Only agents that set a cap constrain the drain.
  const capByAgent = new Map<string, number | null>();
  if (refinementsOn) {
    const agentIds = [...new Set(queued.map((q) => q.agentId).filter((id): id is string => !!id))];
    if (agentIds.length) {
      const agents = await prisma.agent.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, maxConcurrentRuns: true },
      });
      for (const a of agents) capByAgent.set(a.id, a.maxConcurrentRuns ?? null);
    }
  }

  let started = 0;
  const startedByAgent = new Map<string, number>();
  for (const q of queued) {
    if (started >= batchCap) break; // global batch cap reached
    if (!q.agentId || !q.taskId) continue;

    // Per-agent cap: skip (leave queued) an agent already at its in-flight limit. Counts runs RUNNING
    // now (incl. on other workers) plus any this drain already started for the same agent.
    if (refinementsOn) {
      const cap = capByAgent.get(q.agentId) ?? null;
      if (cap != null) {
        const running = await prisma.agentRun.count({
          where: { agentId: q.agentId, status: "running" },
        });
        if (running + (startedByAgent.get(q.agentId) ?? 0) >= cap) continue;
      }
    }

    // Atomic claim — only one worker wins (and a canceled/claimed row is skipped).
    const claimed = await prisma.agentRun.updateMany({
      where: { id: q.id, status: "queued" },
      data: { status: "running", startedAt: new Date() },
    });
    if (claimed.count === 0) continue;
    started++;
    startedByAgent.set(q.agentId, (startedByAgent.get(q.agentId) ?? 0) + 1);
    try {
      await runTaskInSandbox({
        workspaceId: q.workspaceId,
        agentId: q.agentId,
        taskId: q.taskId,
        providerKey: q.providerKey,
        existingRunId: q.id,
      });
    } catch {
      // runTaskInSandbox marks the row failed in its own catch — nothing more to do here.
    }
  }
  return started;
}

/**
 * Cancel an agent run (§3 #2). Two cases, workspace-scoped:
 *   1. RUNNING in THIS process — abort the in-flight exec via the in-process cancellation registry. The
 *      provider kills the child process; the run finalizer marks the row `canceled` + records the
 *      reason. Returns true (cancellation requested; the terminal write follows asynchronously).
 *   2. QUEUED (or a run we can't reach) — mark the row `canceled` in the DB so the worker never picks
 *      it up (the original queued-cancel behavior), stamping exitReason + cancelReason.
 *
 * LIMITATION (see run-cancellation.ts): the registry is IN-PROCESS. A RUNNING run executing on a
 * DIFFERENT instance/invocation than the one handling this request is not reachable — `isRunActive`
 * is false there, so it falls through to the queued-cancel updateMany, which no-ops on a running row
 * and returns false. Killing such a run cross-process needs a durable cancel flag (deferred).
 */
export async function cancelAgentRun(
  workspaceId: string,
  runId: string,
  reason = "canceled by operator",
): Promise<boolean> {
  // Scope-check first: never signal/cancel a run outside the caller's workspace.
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, workspaceId },
    select: { status: true },
  });
  if (!run) return false;

  // RUNNING here → abort the live exec; the run's finalizer writes the terminal canceled row + reason.
  if (run.status === "running" && isRunActive(runId)) {
    return requestRunCancellation(runId, reason);
  }

  // QUEUED (or unreachable running) → best-effort DB cancel so the worker never claims it.
  const res = await prisma.agentRun.updateMany({
    where: { id: runId, workspaceId, status: "queued" },
    data: {
      status: "canceled",
      finishedAt: new Date(),
      exitReason: "canceled",
      cancelReason: reason,
    },
  });
  return res.count > 0;
}

/**
 * Auto-dispatch: for each newly-assigned assignee that is a sandbox-bound AGENT, enqueue a background
 * sandbox run for the task. RUNNERS-gated; deduped against an already-active (queued/running) run so a
 * re-assignment doesn't double-dispatch. Returns the enqueued run ids. Best-effort per assignee.
 */
export async function autoDispatchSandboxForAssignment(
  taskId: string,
  addedProfileIds: string[],
): Promise<string[]> {
  if (!(await isFeatureEnabled(FLAG_KEYS.RUNNERS))) return [];
  const enqueued: string[] = [];
  for (const profileId of addedProfileIds) {
    const agentId = await getProfileAgentId(profileId);
    if (!agentId) continue; // human assignee
    const agent = await prisma.agent.findFirst({
      where: { id: agentId },
      select: { sandboxProvider: true, environmentId: true, workspaceId: true },
    });
    // Dispatchable when the agent has EITHER an ad-hoc sandbox provider OR a bound Environment.
    if (!agent?.workspaceId || (!agent.sandboxProvider && !agent.environmentId)) continue;
    const active = await prisma.agentRun.findFirst({
      where: { taskId, agentId, status: { in: ["queued", "running"] } },
      select: { id: true },
    });
    if (active) continue;
    try {
      const { runId } = await enqueueSandboxRun({
        workspaceId: agent.workspaceId,
        taskId,
        agentId,
      });
      enqueued.push(runId);
    } catch {
      // Skip an assignee whose enqueue fails (e.g. inadmissible) — don't block the others.
    }
  }
  return enqueued;
}
