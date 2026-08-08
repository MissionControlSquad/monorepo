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
  requiresSandboxContainment,
  resolveEffectiveWorkspaceStrategyType,
  FLAG_KEYS,
  type TrustLevel,
} from "@agentcenter/utils";
import type { AgentContextBundle } from "@agentcenter/types";
import { getProfileAgentId } from "@agentcenter/database";
import { prisma } from "@/server/prisma";
import { isFeatureEnabled } from "@/server/feature-flags";
import { assembleContextBundle } from "./agent-context";
import { getSandboxProvider } from "./sandbox-providers";
import { resolveWorkspaceSecret, resolveEnvForAgent } from "./secrets";
import { captureRunMemory } from "./agent-memory";
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
import {
  appendRunLog as appendRunLogChunk,
  finalizeRunLog,
} from "./run-log-store";
import { attachRunBridgeToken } from "./run-bridge";
import { resolveActiveImageRef } from "./environment-custom-images";
import { env as env_ } from "../env";
import type { SandboxProvider, SandboxHandle } from "./sandbox/types";
import type { AgentTrustProfile, EnvironmentLease } from "@agentcenter/database";

const MAX_OUTPUT_CHARS = 45_000;
const MAX_MESSAGE_CHARS = 8_000;
const DEFAULT_TIMEOUT_MS = 600_000;

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
async function postRunToTask(agentId: string, taskId: string, summary: string): Promise<void> {
  try {
    const fromProfileId = await getOrCreateAgentProfileId(agentId);
    await prisma.message.create({
      data: { taskId, fromProfileId, content: summary.slice(0, MAX_MESSAGE_CHARS) },
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
  const env: Record<string, string> = {
    ...(envRes?.envVars ?? {}),
    // Audit-on-resolve (Domain 7 P1): this is a REAL use of the agent's secrets (injected into the
    // run), so pass a consumer context — one `injected` access event is written per bound secret.
    ...(await resolveEnvForAgent(input.workspaceId, agent.id, {
      actorType: "agent",
      actorId: agent.id,
      consumerType: "agent",
      consumerId: agent.id,
      runId: run.id,
    })),
  };

  // In-sandbox API bridge (Plan 6): a run-scoped token the in-box agent can use to post progress back
  // to its task. Only injected when a public MC URL is configured; invalidated when the run finishes.
  const bridgeBaseUrl = env_.NEXT_PUBLIC_MC_URL?.replace(/\/$/, "");
  if (bridgeBaseUrl) {
    const bridgeToken = await attachRunBridgeToken(run.id);
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

  // Live status (Plan 6): track a redacted, TTL'd tail of this run so the UI can watch it mid-flight.
  // Secret VALUES (env + git token) are scrubbed from every streamed chunk.
  beginRunStatus(run.id, [...Object.values(env), ...(gitToken ? [gitToken] : [])]);

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
    // Durable transcript capture: buffer every streamed chunk (in order, with its stream) so we can
    // persist the FULL redacted transcript to the run-log store after exec. Kept separate from the
    // synchronous live tail above; ordering is guaranteed by persisting sequentially post-exec.
    const logChunks: { stream: "stdout" | "stderr"; data: string }[] = [];
    try {
      const result = await handle.exec(script, {
        timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        onLog: (chunk) => {
          appendRunLog(run.id, chunk.data);
          logChunks.push({ stream: chunk.stream, data: chunk.data });
        },
      });
      exitCode = result.exitCode;
      stdout = result.stdout.slice(-MAX_OUTPUT_CHARS);
      stderr = result.stderr.slice(-MAX_OUTPUT_CHARS);
      timedOut = result.timedOut ?? false;
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

    const runStatus = timedOut ? "timeout" : exitCode === 0 ? "done" : "failed";
    setRunPhase(run.id, runStatus);
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
      `Sandbox run (${providerKey}) — ${runStatus}${exitCode != null ? `, exit ${exitCode}` : ""}\n\n${stdout || "(no output)"}${stderr ? `\n[stderr]\n${stderr}` : ""}`,
    );

    // Post-run memory auto-capture (Domain 4 GAP-B): persist run residue when the agent's effective
    // provider is `db`. Best-effort — never fails the run; no-op for none/markdown.
    await captureRunMemory({
      workspaceId: input.workspaceId,
      agentId: agent.id,
      agentProvider: agent.memoryProvider ?? null,
      taskId: input.taskId,
      runId: run.id,
      summary:
        `Run ${runStatus} (${providerKey}${exitCode != null ? `, exit ${exitCode}` : ""}).\n${stdout || ""}`.trim(),
    });

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
    };
  } catch (err) {
    // Provision/exec threw before we could record a result — mark the run failed, then re-throw.
    setRunPhase(run.id, "failed");
    const message = err instanceof Error ? err.message : String(err);
    await prisma.agentRun
      .update({
        where: { id: run.id },
        data: {
          status: "failed",
          errorMessage: message,
          finishedAt: new Date(),
          bridgeTokenHash: null, // invalidate the in-sandbox bridge token
          ...(handle ? { sandboxId: handle.id } : {}),
        },
      })
      .catch(() => {});
    await postRunToTask(agent.id, input.taskId, `Sandbox run (${providerKey}) failed: ${message}`);
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

  try {
    const run = await prisma.agentRun.create({
      data: {
        workspaceId: input.workspaceId,
        agentId: agent.id,
        taskId: input.taskId,
        kind: "sandbox",
        providerKey,
        status: "queued",
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
 * double-run) and executes it, reusing its ledger row. Returns how many it started.
 */
export async function drainSandboxRunQueue(limit = 5): Promise<number> {
  const queued = await prisma.agentRun.findMany({
    where: { status: "queued", kind: "sandbox" },
    orderBy: { createdAt: "asc" },
    take: Math.min(limit, 20),
    select: { id: true, workspaceId: true, agentId: true, taskId: true, providerKey: true },
  });
  let started = 0;
  for (const q of queued) {
    if (!q.agentId || !q.taskId) continue;
    // Atomic claim — only one worker wins (and a canceled/claimed row is skipped).
    const claimed = await prisma.agentRun.updateMany({
      where: { id: q.id, status: "queued" },
      data: { status: "running", startedAt: new Date() },
    });
    if (claimed.count === 0) continue;
    started++;
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
 * Cancel a QUEUED sandbox run (queued→canceled, so the worker never picks it up). A run already
 * executing cannot be cleanly killed in this model — only queued runs are cancellable.
 */
export async function cancelAgentRun(workspaceId: string, runId: string): Promise<boolean> {
  const res = await prisma.agentRun.updateMany({
    where: { id: runId, workspaceId, status: "queued" },
    data: { status: "canceled", finishedAt: new Date() },
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
