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
import { getOrCreateAgentProfileId } from "@/server/agent-profile";

const MAX_OUTPUT_CHARS = 45_000;
const MAX_MESSAGE_CHARS = 8_000;
const DEFAULT_TIMEOUT_MS = 600_000;

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

  const providerKey = (input.providerKey ?? agent.sandboxProvider) || null;
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
  // Inject the agent's OWN bound secrets (LLM API keys, etc.) so a real runtime can authenticate.
  const env = await resolveEnvForAgent(input.workspaceId, agent.id);
  // BYO git token from the workspace vault (GIT_TOKEN, else GITHUB_TOKEN) — only when a repo is cloned.
  const gitToken = bundle.project?.repoUrl
    ? ((await resolveWorkspaceSecret(input.workspaceId, "GIT_TOKEN")) ??
      (await resolveWorkspaceSecret(input.workspaceId, "GITHUB_TOKEN")))
    : null;
  const script = composeSandboxScript({
    prompt,
    repoUrl: bundle.project?.repoUrl,
    runtimeCmd,
    installGuard,
    env,
    gitToken,
  });

  const ctx = {
    workspaceId: input.workspaceId,
    resolveSecret: (name: string) => resolveWorkspaceSecret(input.workspaceId, name),
  };

  // Persist/claim the run ledger row (status=running). The queue worker passes an existing (claimed)
  // row; the synchronous path creates a fresh one.
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

  let handle: Awaited<ReturnType<typeof provider.provision>> | undefined;
  try {
    handle = await provider.provision(ctx);
    let exitCode: number | null;
    let stdout: string;
    let stderr: string;
    try {
      const result = await handle.exec(script, {
        timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
      exitCode = result.exitCode;
      stdout = result.stdout.slice(-MAX_OUTPUT_CHARS);
      stderr = result.stderr.slice(-MAX_OUTPUT_CHARS);
    } finally {
      // Always tear the sandbox down, even on failure — never leak a running sandbox.
      await handle.destroy().catch(() => {});
    }

    const runStatus = exitCode === 0 ? "done" : exitCode === null ? "timeout" : "failed";
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        sandboxId: handle.id,
        status: runStatus,
        exitCode,
        stdout,
        stderr,
        finishedAt: new Date(),
      },
    });

    // Post the outcome to the task timeline (as the agent) so the run is visible in the workflow.
    await postRunToTask(
      agent.id,
      input.taskId,
      `Sandbox run (${providerKey}) — ${runStatus}${exitCode != null ? `, exit ${exitCode}` : ""}\n\n${stdout || "(no output)"}${stderr ? `\n[stderr]\n${stderr}` : ""}`,
    );

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
    const message = err instanceof Error ? err.message : String(err);
    await prisma.agentRun
      .update({
        where: { id: run.id },
        data: {
          status: "failed",
          errorMessage: message,
          finishedAt: new Date(),
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

  const providerKey = (input.providerKey ?? agent.sandboxProvider) || null;
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
      select: { sandboxProvider: true, workspaceId: true },
    });
    if (!agent?.sandboxProvider || !agent.workspaceId) continue;
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
